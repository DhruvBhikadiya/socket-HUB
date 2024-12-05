const webPush = require('web-push');
const vapidKeys = {
  publicKey: 'BFVA5gXzIz-p2poU4ltPxWYVkMwCJgDRW83uVFGb0huBSH6kp3g7s0zW_IYSHlyJM32gIGCo9FjtQLhgwNzYOOk',
  privateKey: '48vJ10QnSbQVsxW6qyk1IvN2eDAPdivkOs52k9Gl_Jg'
};
webPush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);
module.exports = webPush;