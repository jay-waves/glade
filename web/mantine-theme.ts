import {ActionIcon, createTheme} from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'gray',
  fontFamily: '"Mona Sans VF", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  defaultRadius: 'sm',
  radius: {xs:'4px',sm:'8px',md:'12px',lg:'16px',xl:'20px'},
  fontSizes: {xs:'12px',sm:'13px',md:'14px'},
  components: {
    ActionIcon: ActionIcon.extend({defaultProps: {variant: 'subtle', color: 'gray', size: 32, radius: 8}}),
  },
});
