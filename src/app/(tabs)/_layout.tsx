import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';

import { TransitTabBar } from '@/components/transit/tab-bar';

/**
 * The four destinations. The list itself is hidden because the bar that draws
 * them is the trunk line in `TransitTabBar`; the triggers here only declare
 * which routes exist.
 */
export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot />
      <TransitTabBar />
      <TabList style={{ display: 'none' }}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="ledger" href="/ledger" />
        <TabTrigger name="budgets" href="/budgets" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>
    </Tabs>
  );
}
