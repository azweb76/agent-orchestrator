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
      sx={{
        '& .MuiBreadcrumbs-separator': { color: 'text.disabled', mx: 0.75 },
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
              sx={{ fontWeight: 500 }}
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
            sx={{ fontWeight: 600 }}
          >
            {item.label}
          </Typography>
        );
      })}
    </Breadcrumbs>
  );
}
