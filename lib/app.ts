import packageInfo from '../package.json';
import env from './env';

const app = {
  version: packageInfo.version,
  name: 'Undreseller',
  logoUrl: 'https://undreseller.com/icon.png',
  url: env.appUrl,
};

export default app;
