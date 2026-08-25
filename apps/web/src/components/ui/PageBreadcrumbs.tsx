import { Breadcrumbs, Link, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageBreadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <Breadcrumbs
      aria-label="Breadcrumb"
      maxItems={3}
      itemsBeforeCollapse={1}
      sx={{
        minWidth: 0,
        '& .MuiBreadcrumbs-ol': { flexWrap: 'nowrap' },
        '& .MuiBreadcrumbs-li': {
          minWidth: 0,
          maxWidth: { xs: 160, sm: 240 },
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        },
        '& .MuiBreadcrumbs-separator': { color: 'text.disabled', mx: { xs: 0.5, sm: 0.75 } },
      }}
    >
      {items.map((item, index) => {
        const last = index === items.length - 1;
        if (!last && item.to) {
          return (
            <Link
              key={`${item.label}-${index}`}
              component={RouterLink}
              to={item.to}
              underline="hover"
              color="text.secondary"
              variant="body2"
              sx={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {item.label}
            </Link>
          );
        }
        return (
          <Typography
            key={`${item.label}-${index}`}
            variant="body2"
            color="text.primary"
            sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {item.label}
          </Typography>
        );
      })}
    </Breadcrumbs>
  );
}
