import type { BottomTab } from '../components/BottomNav';

export type RootRouteName = 'chatList' | 'feedHub' | 'discoverHub' | 'archiveHub';

export const ROOT_FEATURE_ROUTES: Readonly<Record<BottomTab, readonly string[]>> = {
  contacts: ['chatList', 'chatRoom', 'groupChatRoom', 'notifications', 'call', 'meeting'],
  feed: ['feedHub', 'sns'],
  discover: ['discoverHub', 'random', 'randomChatRoom', 'streetEncounter', 'blindDate', 'datingApp', 'idealWorldcup'],
  archive: ['archiveHub', 'gallery', 'references', 'sumgod', 'debug', 'settings'],
};

const BOTTOM_NAV_VISIBLE_ROUTES = new Set([
  'chatList', 'notifications',
  'feedHub', 'sns',
  'discoverHub', 'random', 'streetEncounter', 'blindDate', 'datingApp', 'idealWorldcup',
  'archiveHub', 'sumgod', 'gallery', 'debug', 'references',
]);

export function routeForRoot(tab: BottomTab): RootRouteName {
  if (tab === 'feed') return 'feedHub';
  if (tab === 'discover') return 'discoverHub';
  if (tab === 'archive') return 'archiveHub';
  return 'chatList';
}

export function rootForRouteName(routeName: string): BottomTab {
  for (const tab of ['contacts', 'feed', 'discover', 'archive'] as const) {
    if (ROOT_FEATURE_ROUTES[tab].includes(routeName)) return tab;
  }
  return 'contacts';
}

/** Keeps the four-root navigation visible only on root and list-style destinations. */
export function shouldShowBottomNavigation(routeName: string): boolean {
  return BOTTOM_NAV_VISIBLE_ROUTES.has(routeName);
}
