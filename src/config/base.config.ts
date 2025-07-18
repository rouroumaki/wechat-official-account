import { Inject } from '@nestjs/common';
import { ConfigType, registerAs } from '@nestjs/config';

export const baseConfig = registerAs('base', () => ({
  domain: process.env.DOMAIN || 'https://mp.kloud.cn',
}));

export const BaseConfig = () => Inject(baseConfig.KEY);

export type IBaseConfig = ConfigType<typeof baseConfig>;
