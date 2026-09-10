import { Badge, Box, Tab, Tabs } from '@mui/material';
import { BRAIN_TABS, BRAIN_TAB_LABELS, type BrainTab } from './brainTabs';

export function BrainTabStrip({
  tab,
  pendingCount,
  onChange,
}: {
  tab: BrainTab;
  /** Unaccepted copilot drafts; badges the Copilot tab. Zero hides the badge. */
  pendingCount: number;
  onChange: (next: BrainTab) => void;
}) {
  return (
    <Tabs
      value={tab}
      onChange={(_event, value: BrainTab) => onChange(value)}
      variant="scrollable"
      allowScrollButtonsMobile
      sx={{ borderBottom: 1, borderColor: 'divider' }}
    >
      {BRAIN_TABS.map((value) => (
        <Tab
          key={value}
          value={value}
          label={
            value === 'copilot' ? (
              <Badge
                badgeContent={pendingCount}
                color="secondary"
                sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}
              >
                <Box component="span">{BRAIN_TAB_LABELS[value]}</Box>
              </Badge>
            ) : (
              BRAIN_TAB_LABELS[value]
            )
          }
        />
      ))}
    </Tabs>
  );
}
