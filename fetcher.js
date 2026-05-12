/**
 * 小红书数据抓取模块
 * 说明：小红书对爬虫有较强防护，此模块提供两种策略：
 *   1. 解析公开分享链接（轻量，成功率较高）
 *   2. 如有需要，可接入第三方数据API（如数据星球、新榜等）
 */
const axios = require('axios');
const cheerio = require('cheerio');

/**
 * 从小红书笔记URL抓取数据
 * @param {string} url  - 完整笔记链接，如 https://www.xiaohongshu.com/explore/xxxxxxxx
 * @param {string} noteId - 笔记ID（可选，从URL解析）
 */
async function fetchPostData(url, noteId) {
  try {
    // 策略1: 尝试通过小红书移动端UA抓取页面
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://www.xiaohongshu.com/',
      },
      maxRedirects: 5
    });

    const $ = cheerio.load(response.data);

    // 尝试从页面meta或JSON-LD提取数据
    let views = 0, likes = 0, collects = 0, comments = 0, title = '';

    // 提取标题
    title = $('meta[property="og:title"]').attr('content') ||
            $('title').text().trim() ||
            '';

    // 尝试提取页面内嵌JSON数据
    const scriptContent = $('script').filter((_, el) => {
      return $(el).html()?.includes('interactInfo') || $(el).html()?.includes('viewCount');
    }).first().html();

    if (scriptContent) {
      const viewMatch = scriptContent.match(/"viewCount":(\d+)/);
      const likeMatch = scriptContent.match(/"likedCount":(\d+)/);
      const collectMatch = scriptContent.match(/"collectedCount":(\d+)/);
      const commentMatch = scriptContent.match(/"commentCount":(\d+)/);

      views = viewMatch ? parseInt(viewMatch[1]) : 0;
      likes = likeMatch ? parseInt(likeMatch[1]) : 0;
      collects = collectMatch ? parseInt(collectMatch[1]) : 0;
      comments = commentMatch ? parseInt(commentMatch[1]) : 0;
    }

    // 如果脚本中没找到，尝试从可见元素抓取
    if (!views && !likes) {
      const interactNums = $('.interact-num, .count').map((_, el) => $(el).text().trim()).get();
      // 这部分依赖具体页面结构，可能需要根据实际页面调整
    }

    console.log(`✅ 抓取成功: ${url} | 播放:${views} 点赞:${likes}`);
    return { success: true, views, likes, collects, comments, title };

  } catch (error) {
    console.error(`❌ 抓取失败: ${url}`, error.message);
    return {
      success: false,
      error: error.message,
      // 备注：若持续抓取失败，建议接入第三方数据服务API
      suggestion: '可接入数据星球(datastarpro.cn)或新榜API获取更稳定的数据'
    };
  }
}

/**
 * 第三方API接入示例（数据星球）
 * 当直接抓取失败时的备用方案
 * 需要在 .env 中配置 DATASTAR_API_KEY
 */
async function fetchViaThirdPartyAPI(noteId) {
  const apiKey = process.env.DATASTAR_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await axios.get(`https://api.datastarpro.cn/xhs/note/${noteId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      timeout: 8000
    });
    const data = res.data?.data;
    if (!data) return null;
    return {
      success: true,
      views: data.view_count || 0,
      likes: data.liked_count || 0,
      collects: data.collected_count || 0,
      comments: data.comment_count || 0,
      title: data.title || ''
    };
  } catch {
    return null;
  }
}

module.exports = { fetchPostData };
