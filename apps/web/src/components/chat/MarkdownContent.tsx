import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Box, Link, Typography } from '@mui/material';

const components: Components = {
  p: ({ children }) => (
    <Typography component="p" sx={{ mb: 1, '&:last-child': { mb: 0 } }}>
      {children}
    </Typography>
  ),
  a: ({ href, children }) => (
    <Link href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </Link>
  ),
  code: ({ className, children, ...props }) => {
    const inline = !className;
    if (inline) {
      return (
        <Box
          component="code"
          sx={{
            px: 0.6,
            py: 0.1,
            borderRadius: 1,
            bgcolor: 'rgba(255,255,255,0.08)',
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.85em',
          }}
          {...props}
        >
          {children}
        </Box>
      );
    }
    return (
      <Box
        component="code"
        className={className}
        sx={{ fontFamily: '"IBM Plex Mono", monospace', fontSize: 13 }}
        {...props}
      >
        {children}
      </Box>
    );
  },
  pre: ({ children }) => (
    <Box
      component="pre"
      sx={{
        p: 1.5,
        my: 1,
        overflow: 'auto',
        borderRadius: 2,
        bgcolor: 'rgba(0,0,0,0.35)',
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {children}
    </Box>
  ),
  ul: ({ children }) => (
    <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
      {children}
    </Box>
  ),
  ol: ({ children }) => (
    <Box component="ol" sx={{ pl: 2.5, my: 1 }}>
      {children}
    </Box>
  ),
  li: ({ children }) => (
    <Typography component="li" sx={{ mb: 0.5 }}>
      {children}
    </Typography>
  ),
  h1: ({ children }) => (
    <Typography variant="h5" sx={{ mt: 1.5, mb: 1 }}>
      {children}
    </Typography>
  ),
  h2: ({ children }) => (
    <Typography variant="h6" sx={{ mt: 1.5, mb: 1 }}>
      {children}
    </Typography>
  ),
  h3: ({ children }) => (
    <Typography variant="subtitle1" sx={{ mt: 1, mb: 0.75, fontWeight: 700 }}>
      {children}
    </Typography>
  ),
  blockquote: ({ children }) => (
    <Box
      component="blockquote"
      sx={{
        m: 0,
        my: 1,
        pl: 1.5,
        borderLeft: '3px solid',
        borderColor: 'secondary.main',
        color: 'text.secondary',
      }}
    >
      {children}
    </Box>
  ),
};

export function MarkdownContent({ content }: { content: string }) {
  return (
    <Box sx={{ '& > *:first-of-type': { mt: 0 } }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </Box>
  );
}
