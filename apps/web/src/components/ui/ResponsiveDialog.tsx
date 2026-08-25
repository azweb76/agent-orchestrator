import { Dialog, useMediaQuery, useTheme, type DialogProps } from '@mui/material';

/** Full-screen dialogs on phones so forms stay usable with the on-screen keyboard. */
export function ResponsiveDialog({ fullScreen, ...props }: DialogProps) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));
  return <Dialog fullScreen={fullScreen ?? isPhone} {...props} />;
}
