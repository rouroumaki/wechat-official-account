import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { WechatModule } from './wechat/wechat.module';

@Module({
  imports: [AppConfigModule, WechatModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
