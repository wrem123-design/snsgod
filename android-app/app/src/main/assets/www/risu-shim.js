(function () {
    const callbacks = [];
    const storagePrefix = 'snsgod:';
    const bootstrapBackupAsset = 'bootstrap-backup.json';
    const bootstrapBackupMarkerKey = storagePrefix + 'standalone_bootstrap_backup_hash';
    document.documentElement.classList.add('snsgod-standalone', 'snsgod-android-shell');

    function hashText(text) {
        let hash = 5381;
        for (let i = 0; i < text.length; i += 1) {
            hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
        }
        return String(text.length) + ':' + (hash >>> 0).toString(16);
    }

    function nativeGetStorageItem(key) {
        const bridge = window.SNSGodAndroid;
        if (!bridge || typeof bridge.getStorageItem !== 'function') return null;
        const value = bridge.getStorageItem(String(key));
        return value === null || value === undefined ? null : String(value);
    }

    function nativeSetStorageItem(key, value) {
        const bridge = window.SNSGodAndroid;
        if (bridge && typeof bridge.setStorageItem === 'function') bridge.setStorageItem(String(key), String(value));
    }

    function chooseStoredValue(key, localValue, nativeValue) {
        void key;
        if (!localValue) return nativeValue;
        return localValue;
    }

    function importBootstrapBackup() {
        try {
            let raw = typeof window.__SNSGOD_BOOTSTRAP_BACKUP_TEXT === 'string'
                ? window.__SNSGOD_BOOTSTRAP_BACKUP_TEXT
                : '';
            if (!raw) {
                const request = new XMLHttpRequest();
                request.open('GET', bootstrapBackupAsset, false);
                request.overrideMimeType('application/json');
                request.send(null);
                if (request.status && request.status !== 200) return;
                raw = request.responseText || '';
            }
            if (!raw.trim()) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object' || !parsed.config || !Array.isArray(parsed.characters)) return;
            const hash = hashText(raw);
            const existingLocalState = localStorage.getItem(storagePrefix + 'msgod_state_v2');
            const existingNativeState = existingLocalState ? null : nativeGetStorageItem('msgod_state_v2');
            const existingState = chooseStoredValue('msgod_state_v2', existingLocalState, existingNativeState);
            if (existingState) {
                localStorage.setItem(storagePrefix + 'msgod_state_v2', existingState);
                nativeSetStorageItem('msgod_state_v2', existingState);
            }
            if (localStorage.getItem(storagePrefix + 'msgod_state_v2')) {
                if (!localStorage.getItem(bootstrapBackupMarkerKey)) localStorage.setItem(bootstrapBackupMarkerKey, hash);
                window.__SNSGOD_BOOTSTRAP_IMPORT = { imported: false, hash, reason: 'existing-state' };
                return;
            }
            if (localStorage.getItem(bootstrapBackupMarkerKey) === hash) return;
            localStorage.setItem(storagePrefix + 'msgod_state_v2', raw);
            nativeSetStorageItem('msgod_state_v2', raw);
            localStorage.setItem(bootstrapBackupMarkerKey, hash);
            window.__SNSGOD_BOOTSTRAP_IMPORT = { imported: true, hash };
        } catch (error) {
            window.__SNSGOD_BOOTSTRAP_IMPORT = {
                imported: false,
                error: error && error.message ? error.message : String(error)
            };
        }
    }

    importBootstrapBackup();

    function normalizeBody(body) {
        if (body == null || typeof body === 'string' || body instanceof FormData || body instanceof Blob) return body;
        return JSON.stringify(body);
    }

    const pendingNativeFetch = new Map();

    window.__snsGodNativeFetchResolve = function (requestId, error, result) {
        const pending = pendingNativeFetch.get(requestId);
        if (!pending) return;
        pendingNativeFetch.delete(requestId);
        if (error) pending.reject(new Error(error));
        else pending.resolve(result);
    };

    async function browserFetch(url, options) {
        const init = Object.assign({}, options || {});
        init.body = normalizeBody(init.body);
        const response = await fetch(url, init);
        const text = await response.text();
        return {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            text,
            body: text
        };
    }

    async function nativeFetch(url, options) {
        const bridge = window.SNSGodAndroid;
        if (!bridge || typeof bridge.nativeFetch !== 'function') return browserFetch(url, options);

        const requestId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const init = Object.assign({}, options || {});
        init.body = normalizeBody(init.body);
        return new Promise(function (resolve, reject) {
            pendingNativeFetch.set(requestId, { resolve, reject });
            try {
                bridge.nativeFetch(requestId, String(url), JSON.stringify(init));
            } catch (error) {
                pendingNativeFetch.delete(requestId);
                reject(error);
            }
        });
    }

    function readStateConfig() {
        try {
            const raw = localStorage.getItem(storagePrefix + 'msgod_state_v2');
            return raw ? (JSON.parse(raw).config || {}) : {};
        } catch (_) {
            return {};
        }
    }

    function textContent(value) {
        if (value == null) return '';
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(textContent).filter(Boolean).join('\n');
        if (typeof value === 'object') return textContent(value.text || value.content || value.body || '');
        return String(value);
    }

    function normalizeMessages(messages) {
        return (Array.isArray(messages) ? messages : []).map(function (message) {
            return {
                role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
                content: textContent(message.content)
            };
        }).filter(function (message) {
            return message.content;
        });
    }

    function geminiPayload(messages, maxTokens, temperature) {
        let systemInstruction = '';
        const contents = [];
        messages.forEach(function (message) {
            if (message.role === 'system') {
                systemInstruction += (systemInstruction ? '\n\n' : '') + message.content;
            } else {
                contents.push({
                    role: message.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: message.content }]
                });
            }
        });
        const body = {
            contents,
            generationConfig: {
                maxOutputTokens: maxTokens,
                temperature
            }
        };
        if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
        return body;
    }

    function extractResponseText(data, apiType) {
        if (!data) return '';
        if (typeof data === 'string') return data;
        if (apiType === 'gemini') {
            return (((data.candidates || [])[0] || {}).content || {}).parts?.map(function (part) {
                return part.text || '';
            }).join('\n').trim() || '';
        }
        if (apiType === 'anthropic') {
            return (data.content || []).map(function (part) {
                return part.text || '';
            }).join('\n').trim();
        }
        return data.output_text
            || (((data.output || [])[0] || {}).content || []).map(function (part) { return part.text || ''; }).join('\n').trim()
            || (((data.choices || [])[0] || {}).message || {}).content
            || '';
    }

    function cleanModelName(apiType, model) {
        const value = String(model || '').trim();
        return apiType === 'gemini' ? value.replace(/^models\//i, '') : value;
    }

    function apiKeySlots(profile) {
        const keys = [];
        function push(value) {
            const key = String(value || '').trim();
            if (key && keys.indexOf(key) < 0) keys.push(key);
        }
        push(profile && profile.apiKey);
        if (Array.isArray(profile && profile.apiKeys)) profile.apiKeys.forEach(push);
        return keys;
    }

    async function runLLMModel(options) {
        const config = readStateConfig();
        const profiles = config.apiProfiles || {};
        let apiType = config.apiType || 'gemini';
        if (apiType === 'risuai') {
            apiType = ['gemini', 'openai', 'anthropic', 'custom'].find(function (name) {
                const profile = profiles[name] || {};
                return profile.apiKey || (name === 'custom' && profile.apiEndpoint);
            }) || 'gemini';
        }

        const defaults = {
            gemini: { apiEndpoint: 'https://generativelanguage.googleapis.com/v1beta', apiModel: 'gemini-2.5-flash' },
            openai: { apiEndpoint: 'https://api.openai.com/v1/responses', apiModel: 'gpt-4.1-mini' },
            anthropic: { apiEndpoint: 'https://api.anthropic.com/v1/messages', apiModel: 'claude-haiku-4-5' },
            custom: { apiEndpoint: '', apiModel: '' }
        };
        const profile = Object.assign({}, defaults[apiType] || defaults.gemini, profiles[apiType] || {});
        profile.apiModel = cleanModelName(apiType, profile.apiModel || (defaults[apiType] || defaults.gemini).apiModel);
        const availableKeys = apiKeySlots(profile);
        if (!profile.apiKey && availableKeys[0]) profile.apiKey = availableKeys[0];
        const messages = normalizeMessages(options && options.messages);
        const maxTokens = Number((options && (options.maxTokens || options.max_tokens || options.maxOutputTokens)) || profile.maxTokens || 700);
        const temperature = Number.isFinite(Number(profile.temperature)) ? Number(profile.temperature) : 0.85;
        let endpoint = profile.apiEndpoint || '';
        let body;
        const headers = { 'Content-Type': 'application/json' };

        if (apiType === 'gemini') {
            if (!profile.apiKey) throw new Error('단독 앱의 RisuAI 보조모델 대체 실행에는 Gemini API 키가 필요합니다.');
            endpoint = endpoint.replace(/\/+$/, '') + '/models/' + encodeURIComponent(profile.apiModel || defaults.gemini.apiModel) + ':generateContent?key=' + encodeURIComponent(profile.apiKey);
            body = geminiPayload(messages, maxTokens, temperature);
        } else if (apiType === 'anthropic') {
            if (!profile.apiKey) throw new Error('단독 앱의 RisuAI 보조모델 대체 실행에는 Anthropic API 키가 필요합니다.');
            headers['x-api-key'] = profile.apiKey;
            headers['anthropic-version'] = '2023-06-01';
            body = {
                model: profile.apiModel || defaults.anthropic.apiModel,
                system: messages.filter(function (message) { return message.role === 'system'; }).map(function (message) { return message.content; }).join('\n\n'),
                messages: messages.filter(function (message) { return message.role !== 'system'; }).map(function (message) {
                    return { role: message.role === 'assistant' ? 'assistant' : 'user', content: message.content };
                }),
                max_tokens: maxTokens,
                temperature
            };
        } else {
            if (profile.apiKey) headers.Authorization = 'Bearer ' + profile.apiKey;
            if (!endpoint) throw new Error('단독 앱의 RisuAI 보조모델 대체 실행에는 외부 API Endpoint가 필요합니다.');
            const responseMode = /\/responses(?:\?|$)/.test(endpoint);
            body = responseMode ? {
                model: profile.apiModel || defaults.openai.apiModel,
                input: messages.map(function (message) {
                    return { role: message.role === 'system' ? 'developer' : message.role, content: message.content };
                }),
                max_output_tokens: maxTokens,
                temperature
            } : {
                model: profile.apiModel || defaults.openai.apiModel,
                messages,
                max_tokens: maxTokens,
                temperature,
                stream: false
            };
        }

        const response = await nativeFetch(endpoint, { method: 'POST', headers, body });
        const raw = response.text || response.body || '';
        if (!response.ok && Number(response.status) >= 400) throw new Error('LLM API 오류 ' + response.status + ': ' + raw.slice(0, 500));
        const text = extractResponseText(JSON.parse(raw), apiType).replace(/^```(?:json)?\s*|```$/g, '').trim();
        if (!text) throw new Error('LLM 응답에서 텍스트를 찾지 못했습니다.');
        return text;
    }

    function blobToDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            const reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('Blob read failed')); };
            reader.readAsDataURL(blob);
        });
    }

    document.addEventListener('click', async function (event) {
        const link = event.target && event.target.closest ? event.target.closest('a[download]') : null;
        const href = String(link && link.href || '');
        if (!link || (!href.startsWith('data:') && !href.startsWith('blob:'))) return;
        const bridge = window.SNSGodAndroid;
        if (!bridge || typeof bridge.saveDataUrl !== 'function') return;
        event.preventDefault();
        try {
            const dataUrl = href.startsWith('data:') ? href : await blobToDataUrl(await fetch(href).then(function (response) { return response.blob(); }));
            bridge.saveDataUrl(link.getAttribute('download') || 'snsgod-export', dataUrl);
        } catch (error) {
            alert('저장 실패: ' + (error && error.message ? error.message : error));
        }
    }, true);

    const pluginStorage = {
        async getItem(key) {
            const localValue = localStorage.getItem(storagePrefix + key);
            if (localValue !== null && localValue !== undefined) return localValue;
            const bridge = window.SNSGodAndroid;
            if (bridge && typeof bridge.getStorageItem === 'function') {
                const nativeValue = nativeGetStorageItem(key);
                const chosenValue = chooseStoredValue(key, localValue, nativeValue);
                if (chosenValue !== null && chosenValue !== undefined) {
                    localStorage.setItem(storagePrefix + key, String(chosenValue));
                    return String(chosenValue);
                }
            }
            return localStorage.getItem(storagePrefix + key);
        },
        async setItem(key, value) {
            const text = String(value);
            localStorage.setItem(storagePrefix + key, text);
            nativeSetStorageItem(key, text);
        },
        async removeItem(key) {
            localStorage.removeItem(storagePrefix + key);
            const bridge = window.SNSGodAndroid;
            if (bridge && typeof bridge.removeStorageItem === 'function') bridge.removeStorageItem(String(key));
        },
        async keys() {
            const keys = [];
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (key && key.startsWith(storagePrefix)) keys.push(key.slice(storagePrefix.length));
            }
            return keys;
        }
    };

    const Risu = {
        pluginStorage,
        nativeFetch,
        risuFetch: nativeFetch,
        runLLMModel,
        async registerSetting(_name, callback) {
            callbacks.push(callback);
            setTimeout(() => callback && callback(), 0);
        },
        async registerButton(_options, callback) {
            if (callback) callbacks.push(callback);
        },
        async showContainer() {
            document.documentElement.classList.add('snsgod-standalone', 'snsgod-android-shell');
        },
        async hideContainer() {
            document.documentElement.classList.add('snsgod-standalone', 'snsgod-android-shell');
        },
        async onUnload(callback) {
            window.addEventListener('beforeunload', function () {
                try { callback && callback(); } catch (_) {}
            });
        }
    };

    window.risuai = Risu;
    window.Risuai = Risu;
})();
