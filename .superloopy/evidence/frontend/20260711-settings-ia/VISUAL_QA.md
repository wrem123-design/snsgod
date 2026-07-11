# Settings information architecture visual QA

## Automated and static evidence

- PASS: basic and advanced section arrays are explicit, bounded, and non-overlapping.
- PASS: local-only/remote-assist boundary is the first basic card; backup has its own basic section.
- PASS: Provider/Endpoint/key, Oracle server/external push, image raw rules, raw prompts, and lorebook are reachable only through the advanced mode.
- PASS: legacy values initialize the same draft fields and mode changes do not call persistence.
- PASS: the obsolete duplicate prompt shortcut and unreachable SNS prompt card are removed; raw prompts retain one dedicated-screen entry.
- PASS: 236 Node tests and TypeScript check pass.

## Device evidence

- PASS: versionCode 13 release APK installed on Samsung SM-S948N with `adb install -r`; existing local content remained present.
- PASS: every settings entry starts in `기본 설정` even when legacy state remembered an expert section. The accessibility tree selects basic mode and exposes exactly five child sections.
- PASS: the first basic viewport shows `로컬 데이터 기준`, local-only state, the Oracle switch, network boundary copy, and the start of the existing profile without horizontal clipping at 384dp logical width.
- PASS: `고급 설정` exposes exactly four child sections and begins with the warning before Provider inputs. Existing custom Provider endpoint/model values remained populated and unchanged.
- PASS: `원문 프롬프트` opens the dedicated editor directly; Android Back returns to a fresh basic settings view. `백업` opens the standalone compatible/encrypted backup section.
- PASS: accessibility labels and selected tab state are present for both mode controls; the crash buffer remained empty after cold start and all navigation.
- No saved field, switch, password, export, import, or server action was changed during device inspection. Raw screenshots remain in the ignored local device-evidence directory.
