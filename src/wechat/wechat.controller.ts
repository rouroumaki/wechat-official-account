import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { WechatService } from './wechat.service';

@Controller('wechat')
export class WechatController {
  constructor(private readonly wechatService: WechatService) {}

  @Get('articles')
  async getArticles(
    @Query('offset') offset: number = 0,
    @Query('count') count: number = 10,
  ) {
    return await this.wechatService.getPublishedArticles(offset, count);
  }

  @Get('article/:id')
  async getArticle(@Param('id') id: string) {
    return await this.wechatService.getArticleDetail(id);
  }

  @Get('drafts')
  async getDrafts(
    @Query('offset') offset: number = 0,
    @Query('count') count: number = 10,
  ) {
    return await this.wechatService.getDraftList(offset, count);
  }

  @Post('convertByUrl')
  async convertByUrl(@Body() body: { url: string }) {
    return await this.wechatService.convert({ url: body.url });
  }
}
