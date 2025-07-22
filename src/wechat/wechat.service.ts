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
    const styleTags = $('[style]'); // 查找含 style 属性的标签

    // 工具函数：下载图片并返回新的本地 URL
    const downloadAndReplace = async (
      url: string,
      dataType?: string,
    ): Promise<string | null> => {
      try {
        let ext = path.extname(url.split('?')[0]) || '.jpg';
        if (dataType === 'svg') {
          ext = '.svg';
        }
        const id = uuidv4();
        const filename = id + ext;
        const filePath = path.join(this.imageDir, filename);
        const fileUrl = `${this.baseConfig.domain}/images/${filename}`;

        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(filePath, response.data);

        return fileUrl;
      } catch (error) {
        console.warn(`Failed to download: ${url}`, error.message);
        return null;
      }
    };

    // 处理 <img src="...">
    const imgTasks = imgTags
      .map(async (i, img) => {
        const src = $(img).attr('src');
        const dataType = $(img).attr('data-type');
        if (!src || !/^https?:\/\//.test(src)) return;

        const newUrl = await downloadAndReplace(src, dataType);
        if (newUrl) $(img).attr('src', newUrl);
      })
      .get();

    // 处理 style="background-image: url(...)"
    const styleTasks = styleTags
      .map(async (i, el) => {
        const style = $(el).attr('style');
        if (!style) return;

        // 查找所有 background url(...) 的链接
        const urlRegex = /url\(["']?(https?:\/\/[^"')]+)["']?\)/g;
        const matches = [...style.matchAll(urlRegex)];

        let newStyle = style;
        for (const match of matches) {
          const originalUrl = match[1];
          const newUrl = await downloadAndReplace(originalUrl);
          if (newUrl) {
            newStyle = newStyle.replace(originalUrl, newUrl);
          }
        }

        $(el).attr('style', newStyle);
      })
      .get();

    const iframeTags = $('iframe.video_iframe');

    const iframeTasks = iframeTags
      .map(async (i, el) => {
        const $el = $(el);
        const coverEncoded = $el.attr('data-cover');
        const videoUrl = $el.attr('src');
        if (!coverEncoded || !videoUrl) return;

        const coverDecoded = decodeURIComponent(coverEncoded);
        const ext = path.extname(coverDecoded.split('?')[0]) || '.jpg';
        const filename = uuidv4() + ext;
        const localFilePath = path.join(this.imageDir, filename);
        const publicUrl = `${this.baseConfig.domain}/images/${filename}`;

        try {
          const response = await axios.get(coverDecoded, {
            responseType: 'arraybuffer',
          });
          fs.writeFileSync(localFilePath, response.data);

          // 构建 <a><img></a>
          const anchorHtml = `
            <a href="${videoUrl}" target="_blank" rel="noopener noreferrer">
              <img src="${publicUrl}" style="width:100%; border-radius: 4px;" />
            </a>
          `;

          $el.replaceWith(anchorHtml);
        } catch (err) {
          console.warn(`⚠️ 封面下载失败: ${coverDecoded}`, err.message);
          // 失败就保留原 iframe
        }
      })
      .get();

    await Promise.all([...imgTasks, ...styleTasks, ...iframeTasks]);

    const tagsToRemove = ['mp-common-videosnap', 'iframe'];
    tagsToRemove.forEach((tag) => $(tag).remove());

    return $('body').html() || '';
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
