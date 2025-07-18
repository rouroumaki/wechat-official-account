import { Inject } from '@nestjs/common';
import { registerAs } from '@nestjs/config';

export const wechatConfig = registerAs('wechat', () => ({
  appId: process.env.APP_ID || '',
  appSecret: process.env.APP_SECRET || '',
}));

export const WechatConfig = () => Inject(wechatConfig.KEY);
