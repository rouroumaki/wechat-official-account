import { Injectable, HttpException, Inject } from '@nestjs/common';
import axios from 'axios';
import { wechatConfig } from '../config/wechat.config';
import { ConfigType } from '@nestjs/config';
import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BaseConfig, IBaseConfig } from 'src/config/base.config';

@Injectable()
export class WechatService {
  private readonly imageDir = path.join(
    __dirname,
    '..',
    '..',
    'public',
    'images',
  );

  constructor(
    @Inject(wechatConfig.KEY)
    private readonly config: ConfigType<typeof wechatConfig>,
    @BaseConfig()
    private readonly baseConfig: IBaseConfig,
  ) {
    if (!fs.existsSync(this.imageDir)) {
      fs.mkdirSync(this.imageDir, { recursive: true });
    }
  }

  private accessToken = '';
  private expiresAt = 0;

  async processHtml(html: string): Promise<string> {
    const $ = cheerio.load(html);
    const imgTags = $('img');

    await Promise.all(
      imgTags
        .map(async (i, img) => {
          const src = $(img).attr('src');
          if (!src || !/^https?:\/\//.test(src)) return;

          try {
            const ext = path.extname(src).split('?')[0] || '.jpg';
            const id = uuidv4();
            const filename = id + ext;
            const filePath = path.join(this.imageDir, filename);
            const fileUrl = `${this.baseConfig.domain}/images/${filename}`;

            const response = await axios.get(src, {
              responseType: 'arraybuffer',
            });
            fs.writeFileSync(filePath, response.data);

            $(img).attr('src', fileUrl);
          } catch (error) {
            console.warn(`Failed to download image: ${src}`, error.message);
          }
        })
        .get(),
    ); // .get() converts cheerio result to array

    return $('body').html() as string;
  }

  // 获取 access_token，自动缓存
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.expiresAt) {
      return this.accessToken;
    }
    const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.config.appId}&secret=${this.config.appSecret}`;
    const res = await axios.get(url);
    if (res.data.access_token) {
      this.accessToken = res.data.access_token;
      this.expiresAt = now + (res.data.expires_in - 60) * 1000; // 提前1分钟过期
      return this.accessToken;
    }
    throw new HttpException('获取access_token失败', 500);
  }

  // 获取已发布文章列表
  async getPublishedArticles(offset = 0, count = 100) {
    const accessToken = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/freepublish/batchget?access_token=${accessToken}`;
    const res = await axios.post(url, {
      offset,
      count,
      no_content: 0,
    });
    if (res.data.item) {
      return res.data;
    } else {
      throw new HttpException(res.data.errmsg, 500);
    }
  }
  async getArticleDetail(articleId: string) {
    const accessToken = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/freepublish/getarticle?access_token=${accessToken}`;
    const res = await axios.post(url, {
      article_id: articleId,
    });
    if (res.data.news_item) {
      return res.data;
    } else {
      throw new HttpException(res.data.errmsg, 500);
    }
  }

  async getDraftList(offset = 0, count = 100) {
    const accessToken = await this.getAccessToken();
    const url = `https://api.weixin.qq.com/cgi-bin/draft/batchget?access_token=${accessToken}`;
    const res = await axios.post(url, {
      offset,
      count,
      no_content: 0,
    });
    if (res.data.item) {
      return res.data;
    } else {
      throw new HttpException(res.data.errmsg, 500);
    }
  }

  async convert({ url }: { url: string }) {
    const res = await axios.post(
      'https://yiban.io/api/abtest/fetch_wx_article',
      {
        url,
      },
    );
    if (res.data.status_code === 200) {
      const html = await this.processHtml(res.data.data.content_noencode);
      return {
        ...res.data.data,
        content_noencode: html,
      };
    } else {
      throw new HttpException(res.data.status_message, 500);
    }
  }
}
