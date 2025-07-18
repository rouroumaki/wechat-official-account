import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { wechatConfig } from './wechat.config';
import { baseConfig } from './base.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ConfigModule.forFeature(wechatConfig),
    ConfigModule.forFeature(baseConfig),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
