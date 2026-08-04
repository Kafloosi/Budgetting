import { TabList, TabSlot, TabTrigger, Tabs } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { TransitTabBar } from '@/components/transit/tab-bar';

/**
 * The four destinations. The list itself is hidden because the bar that draws
 * them is the trunk line in `TransitTabBar`; the triggers here only declare
 * which routes exist.
 */
export default function TabsLayout() {
  return (
    // Both the container and the slot have to claim the height explicitly, or
    // the slot grows to its content and pushes the bar off the bottom of the
    // screen — taking the entry action with it.
    <Tabs style={styles.container}>
      <TabSlot style={styles.slot} />
      <TransitTabBar />
      <TabList style={styles.hidden}>
        <TabTrigger name="index" href="/" />
        <TabTrigger name="ledger" href="/ledger" />
        <TabTrigger name="budgets" href="/budgets" />
        <TabTrigger name="settings" href="/settings" />
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  slot: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});
