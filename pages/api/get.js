import axios from 'axios';

// 歌曲映射表 - 直接映射到对应的MID
const songMapping = {
  // 格式: '歌名_艺人': 'MID'
  
  // 歌单匹配错误
  '無條件_陳奕迅': '001HpGqo4daJ21',
  '一樣的月光_徐佳瑩': '001KyJTt1kbkfP',
  '拉过勾的_陸虎': '004QCuMF2nVaxn',
  '人生馬拉松_陳奕迅': '004J2NXe3bwkjk',
  
  // 李志
  '天空之城_李志': '002QU4XI2cKwua',
  '關於鄭州的記憶_李志': '002KPXam27DeEJ',
  
  // 吴亦凡
  '大碗宽面_吳亦凡': '001JceuO3lQbyN',
  'November Rain_吳亦凡': '000RQ1Hy29awJd',
  'July_吳亦凡': '001fszA13qSD04',

  // 可以继续添加更多映射...
  'La La La_Naughty Boy': '0000TrG33CVLrW',
};

export default async function handler(req, res) {
  // CORS 设置
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const { track_name, artist_name, trackName, artistName } = req.query;
  const finalTrackName = trackName || track_name;
  const finalArtistName = artistName || artist_name;
  
  if (!finalTrackName || !finalArtistName) {
    return res.status(400).json({ 
      error: 'Missing parameters',
      message: 'trackName/track_name 和 artistName/artist_name 参数都是必需的'
    });
  }
  
  try {
    console.log('========== 开始处理歌词请求 ==========');
    console.log('搜索请求:', { trackName: finalTrackName, artistName: finalArtistName });
    
    // 预处理
    const processedTrackName = preprocessTrackName(finalTrackName);
    const processedArtists = preprocessArtists(finalArtistName);
    console.log('预处理结果:', { processedTrackName, processedArtists });
    
    // 检查是否需要直接映射到特定MID
    const mappedMid = checkSongMapping(processedTrackName, processedArtists, finalTrackName, finalArtistName);
    if (mappedMid) {
      console.log(`检测到映射歌曲，直接使用MID: ${mappedMid}`);
      return await handleMappedSong(mappedMid, finalTrackName, finalArtistName, res);
    }
    
    console.log('正常搜索:', processedTrackName);
    
    // 搜索
    const song = await searchSong(processedTrackName, processedArtists, finalTrackName, finalArtistName);
    
    if (!song) {
      console.log('未找到匹配的歌曲');
      return res.status(404).json({ error: 'Song not found', message: '未找到匹配的歌曲' });
    }
    
    console.log('找到歌曲:', { name: getSongName(song), artist: extractArtists(song), id: song.id, mid: song.mid });
    
    // 获取歌词
    const lyrics = await getLyrics(song.mid || song.id);
    
    console.log('歌词获取结果:', {
      syncedLyricsLength: lyrics.syncedLyrics?.length || 0,
      translatedLyricsLength: lyrics.translatedLyrics?.length || 0,
      yrcLyricsLength: lyrics.yrcLyrics?.length || 0
    });
    
    // 返回结果
    const response = {
      id: song.id,
      mid: song.mid,
      name: getSongName(song) || finalTrackName,
      trackName: getSongName(song) || finalTrackName,
      artistName: extractArtists(song),
      albumName: extractAlbumName(song),
      duration: calculateDuration(song.interval),
      instrumental: (!lyrics.syncedLyrics || lyrics.syncedLyrics.trim() === '') && 
                    (!lyrics.translatedLyrics || lyrics.translatedLyrics.trim() === ''),
      plainLyrics: '',
      syncedLyrics: lyrics.syncedLyrics,
      translatedLyrics: lyrics.translatedLyrics,
      yrcLyrics: lyrics.yrcLyrics || '' // 新增：逐字歌词
    };
    
    console.log('========== 处理完成 ==========\n');
    res.status(200).json(response);
    
  } catch (error) {
    console.error('API 错误:', error);
    res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

// 检查歌曲映射
function checkSongMapping(processedTrackName, processedArtists, originalTrackName, originalArtistName) {
  console.log('检查歌曲映射...');
  
  // 尝试多种键格式进行匹配
  const possibleKeys = [
    `${processedTrackName}_${processedArtists[0]}`,
    `${originalTrackName}_${originalArtistName}`,
    `${processedTrackName}_${originalArtistName}`,
    `${originalTrackName}_${processedArtists[0]}`,
    // 对于英文歌名，也尝试小写匹配
    `${processedTrackName.toLowerCase()}_${processedArtists[0]}`,
    `${originalTrackName.toLowerCase()}_${originalArtistName}`,
    `${processedTrackName.toLowerCase()}_${originalArtistName}`,
    `${originalTrackName.toLowerCase()}_${processedArtists[0]}`
  ];
  
  console.log('尝试的映射键:', possibleKeys);
  
  for (const key of possibleKeys) {
    if (songMapping[key]) {
      console.log(`找到映射: ${key} -> ${songMapping[key]}`);
      return songMapping[key];
    }
  }
  
  console.log('未找到歌曲映射');
  return null;
}

// 处理映射歌曲
async function handleMappedSong(mappedMid, originalTrackName, originalArtistName, res) {
  console.log('处理映射歌曲...');
  
  try {
    // 直接使用映射的MID获取歌词
    const lyrics = await getLyrics(mappedMid);
    
    // 尝试获取歌曲信息
    let songInfo = null;
    try {
      console.log('尝试获取映射歌曲信息...');
      songInfo = await getSongInfoByMid(mappedMid);
      console.log('获取到歌曲信息:', songInfo ? '成功' : '失败');
    } catch (error) {
      console.log('无法获取歌曲信息，使用默认信息:', error.message);
    }
    
    const response = {
      id: mappedMid,
      mid: mappedMid,
      name: songInfo ? getSongName(songInfo) : originalTrackName,
      trackName: songInfo ? getSongName(songInfo) : originalTrackName,
      artistName: songInfo ? extractArtists(songInfo) : originalArtistName,
      albumName: songInfo ? extractAlbumName(songInfo) : '',
      duration: songInfo ? calculateDuration(songInfo.interval) : 0,
      instrumental: (!lyrics.syncedLyrics || lyrics.syncedLyrics.trim() === '') && 
                    (!lyrics.translatedLyrics || lyrics.translatedLyrics.trim() === ''),
      plainLyrics: '',
      syncedLyrics: lyrics.syncedLyrics,
      translatedLyrics: lyrics.translatedLyrics,
      yrcLyrics: lyrics.yrcLyrics || '',
      isMapped: true, // 标记这是映射版本
      originalTrackName: originalTrackName,
      originalArtistName: originalArtistName
    };
    
    console.log('映射歌曲处理完成');
    res.status(200).json(response);
    
  } catch (error) {
    console.error('处理映射歌曲失败:', error);
    res.status(500).json({ error: 'Failed to get mapped song', message: error.message });
  }
}

// 通过MID获取歌曲信息
async function getSongInfoByMid(mid) {
  console.log(`通过MID获取歌曲信息: ${mid}`);
  
  try {
    const response = await axios.get(`https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg?songmid=${mid}&format=json`, {
      headers: {
        'Referer': 'https://c.y.qq.com/'
      }
    });
    
    console.log('获取歌曲信息响应:', response.status);
    
    if (response.data.data && response.data.data.length > 0) {
      console.log('成功获取歌曲信息');
      return response.data.data[0];
    }
    
    throw new Error('无法获取歌曲信息');
  } catch (error) {
    console.error('获取歌曲信息失败:', error.message);
    throw error;
  }
}

// 预处理艺术家
function preprocessArtists(artistName) {
  console.log(`预处理艺术家: ${artistName}`);
  
  const artists = artistName.split(/\s*,\s*|\s+&\s+|\s+和\s+/);
  const uniqueArtists = [...new Set(artists.filter(artist => artist.trim()))];
  
  console.log(`预处理艺术家结果: ${uniqueArtists.join(', ')}`);
  return uniqueArtists;
}

// 预处理歌名
function preprocessTrackName(trackName) {
  console.log(`预处理歌名: ${trackName}`);
  
  const patterns = [
    / - genshin impact's.*$/i,
    / - .*anniversary.*$/i,
    / - .*theme song.*$/i,
    / - .*japanese.*$/i,
    / - .*version.*$/i,
    / - 《.*?》.*$/,
    / - .*动画.*$/,
    / - .*剧集.*$/,
    / - .*主题曲.*$/,
    /\(.*?\)/g,
    / - from the.*$/i,
    / - official.*$/i,
    / \(from.*\)/gi,
    / - remastered.*$/i,
    / - .*mix.*$/i,
    / - .*edit.*$/i,
    /《(.*?)》/g,
    /---/g,
    /———/g,
    / - $/,
  ];
  
  let processed = trackName;
  console.log('原始歌名:', processed);
  
  for (const pattern of patterns) {
    const before = processed;
    processed = processed.replace(pattern, '');
    if (before !== processed) {
      console.log(`应用模式 ${pattern}: ${before} -> ${processed}`);
    }
  }
  
  processed = processed.replace(/\s+/g, ' ').replace(/[-\s]+$/g, '').trim();
  
  if (!processed) {
    processed = trackName.split(/[-\s–—]/)[0].trim();
    console.log(`歌名为空，使用第一部分: ${processed}`);
  }
  
  console.log(`预处理歌名结果: ${processed}`);
  return processed;
}

// 使用官方API搜索歌曲
async function searchSong(trackName, artists, originalTrackName, originalArtistName) {
  console.log('开始搜索歌曲...');
  console.log(`搜索参数: trackName=${trackName}, artists=${artists.join(', ')}, originalTrackName=${originalTrackName}`);
  
  const shouldSimplify = trackName.length > 30 || 
    / - | – | — |\(|\)|《|》|动画|剧集|主题曲|anniversary|theme song|version|remastered|mix|edit|致.*先生|———/i.test(trackName);
  
  if (shouldSimplify) {
    console.log('检测到复杂歌名，使用简化搜索');
    return await simplifiedSearch(trackName, artists, originalTrackName, originalArtistName);
  }
  
  // 使用官方API搜索 - 限制返回3个结果
  for (const artist of artists) {
    try {
      console.log(`尝试搜索: ${trackName} ${artist}`);
      
      const searchData = {
        req_1: {
          method: "DoSearchForQQMusicDesktop",
          module: "music.search.SearchCgiService",
          param: {
            num_per_page: 3,
            page_num: 1,
            query: trackName + ' ' + artist,
            search_type: 0
          }
        }
      };
      
      const response = await axios.post('https://u.y.qq.com/cgi-bin/musicu.fcg', searchData, {
        headers: {
          'Referer': 'https://c.y.qq.com/',
          'Content-Type': 'application/json'
        }
      });
      
      console.log('搜索响应状态:', response.status);
      
      const data = response.data;
      
      if (data?.req_1?.data?.body?.song?.list?.length > 0) {
        console.log(`找到 ${data.req_1.data.body.song.list.length} 个结果`);
        const songs = transformSearchResults(data.req_1.data.body.song.list);
        const match = findBestMatch(songs, trackName, artists, originalTrackName, originalArtistName);
        if (match) {
          console.log('找到最佳匹配');
          return match;
        }
      } else {
        console.log('搜索结果为空');
      }
    } catch (error) {
      console.error('官方API搜索失败:', error.message);
    }
  }
  
  console.log('搜索失败，未找到匹配的歌曲');
  return null;
}

// 转换官方API搜索结果格式
function transformSearchResults(songList) {
  console.log(`转换搜索结果: ${songList.length} 首歌曲`);
  
  const transformed = songList.map(song => ({
    id: song.id,
    mid: song.mid,
    name: song.name,
    title: song.name,
    singer: song.singer,
    album: song.album,
    interval: song.interval,
    songname: song.name
  }));
  
  console.log('转换后的结果:', transformed.map(s => ({id: s.id, name: s.name})));
  return transformed;
}

// 简化搜索 - 使用官方API
async function simplifiedSearch(trackName, artists, originalTrackName, originalArtistName) {
  console.log('开始简化搜索...');
  
  const strategies = [
    // 策略1: 核心歌名 + 艺术家
    () => {
      const coreName = extractCoreName(trackName);
      console.log(`策略1: 核心歌名 ${coreName}`);
      return artists.map(artist => `${coreName} ${artist}`);
    },
    // 策略2: 预处理歌名 + 艺术家
    () => {
      const processed = preprocessTrackName(trackName);
      console.log(`策略2: 预处理歌名 ${processed}`);
      return artists.map(artist => `${processed} ${artist}`);
    },
  ];
  
  for (let i = 0; i < strategies.length; i++) {
    try {
      console.log(`尝试策略 ${i + 1}...`);
      const keywords = strategies[i]();
      
      for (const keyword of keywords) {
        console.log(`搜索关键词: ${keyword}`);
        
        const searchData = {
          req_1: {
            method: "DoSearchForQQMusicDesktop",
            module: "music.search.SearchCgiService",
            param: {
              num_per_page: 3,
              page_num: 1,
              query: keyword,
              search_type: 0
            }
          }
        };
        
        const response = await axios.post('https://u.y.qq.com/cgi-bin/musicu.fcg', searchData, {
          headers: {
            'Referer': 'https://c.y.qq.com/',
            'Content-Type': 'application/json'
          }
        });
        
        console.log(`策略 ${i + 1} 搜索响应状态:`, response.status);
        
        const data = response.data;
        
        if (data?.req_1?.data?.body?.song?.list?.length > 0) {
          console.log(`策略 ${i + 1} 找到 ${data.req_1.data.body.song.list.length} 个结果`);
          const songs = transformSearchResults(data.req_1.data.body.song.list);
          const match = findBestMatch(songs, trackName, artists, originalTrackName, originalArtistName);
          if (match) {
            console.log(`策略 ${i + 1} 找到最佳匹配`);
            return match;
          }
        } else {
          console.log(`策略 ${i + 1} 搜索结果为空`);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.warn(`策略${i+1} 失败:`, error.message);
    }
  }
  
  console.log('简化搜索失败');
  return null;
}

// 提取核心歌名
function extractCoreName(text) {
  console.log(`提取核心歌名: ${text}`);
  
  const isEnglish = /^[a-zA-Z\s.,!?'"-]+$/.test(text);
  if (isEnglish) {
    const processed = preprocessTrackName(text);
    const result = processed && processed.length < text.length ? processed : text;
    console.log(`英文核心歌名: ${result}`);
    return result;
  }
  
  const japanesePart = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/);
  if (japanesePart) {
    console.log(`日文/中文核心歌名: ${japanesePart[0]}`);
    return japanesePart[0];
  }
  
  const processed = preprocessTrackName(text);
  const result = processed && processed.length < text.length ? processed : text.split(/[-\s–—|]/)[0] || text;
  console.log(`其他核心歌名: ${result}`);
  return result;
}

// 查找最佳匹配
function findBestMatch(results, targetTrack, artists, originalTrackName, originalArtistName) {
  console.log('查找最佳匹配...');
  console.log(`待匹配结果数: ${results.length}`);
  console.log(`目标歌名: ${targetTrack}, 艺术家: ${artists.join(', ')}, 原始歌名: ${originalTrackName}`);
  
  // 先尝试精确匹配（歌曲名和艺术家都匹配）
  const exactMatch = findExactMatch(results, originalTrackName, originalArtistName);
  if (exactMatch) {
    console.log('找到精确匹配');
    return exactMatch;
  }
  
  // 使用更智能的评分系统
  let bestMatch = null;
  let bestScore = 0;
  
  console.log('开始评分匹配...');
  for (const song of results) {
    const score = calculateSmartScore(song, targetTrack, artists, originalTrackName, originalArtistName);
    console.log(`歌曲评分: ${getSongName(song)} - 得分: ${score.toFixed(2)}`);
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = song;
    }
  }
  
  if (bestMatch) {
    console.log(`最佳匹配: ${getSongName(bestMatch)}, 得分: ${bestScore.toFixed(2)}`);
  } else if (results.length > 0) {
    console.log('无高评分匹配，返回第一个结果');
    bestMatch = results[0];
  }
  
  return bestMatch;
}

// 精确匹配 - 要求歌曲名和艺术家都匹配
function findExactMatch(results, originalTrackName, originalArtistName) {
  console.log('尝试精确匹配...');
  
  const trackLower = originalTrackName.toLowerCase();
  const artistLower = originalArtistName.toLowerCase();
  
  for (const song of results) {
    const songName = getSongName(song);
    const songArtists = extractArtists(song);
    
    if (songName && songArtists) {
      const songNameLower = songName.toLowerCase();
      const songArtistsLower = songArtists.toLowerCase();
      
      // 要求歌曲名和艺术家都完全匹配
      if (songNameLower === trackLower && songArtistsLower === artistLower) {
        console.log(`精确匹配成功: ${songName} - ${songArtists}`);
        return song;
      }
    }
  }
  
  console.log('无精确匹配');
  return null;
}

// 更智能的评分系统
function calculateSmartScore(song, targetTrack, artists, originalTrackName, originalArtistName) {
  const songName = getSongName(song);
  if (!songName) return 0;
  
  const songTitle = songName.toLowerCase();
  const songArtists = extractArtists(song).toLowerCase();
  const targetTrackLower = targetTrack.toLowerCase();
  const originalTrackNameLower = originalTrackName.toLowerCase();
  const originalArtistNameLower = originalArtistName.toLowerCase();
  
  let titleScore = 0;
  let artistScore = 0;
  
  // 计算歌曲名匹配分数 - 更智能的匹配
  if (songTitle === originalTrackNameLower) {
    titleScore = 100; // 完全匹配原始歌名 - 最高分
  } else if (songTitle === targetTrackLower) {
    titleScore = 90; // 完全匹配预处理歌名
  } else if (isCloseMatch(songTitle, originalTrackNameLower)) {
    titleScore = 80; // 接近匹配原始歌名
  } else if (isCloseMatch(songTitle, targetTrackLower)) {
    titleScore = 70; // 接近匹配预处理歌名
  } else if (songTitle.includes(originalTrackNameLower) && originalTrackNameLower.length > 3) {
    titleScore = 60; // 包含原始歌名
  } else if (originalTrackNameLower.includes(songTitle) && songTitle.length > 3) {
    titleScore = 50; // 被原始歌名包含
  } else if (songTitle.includes(targetTrackLower) && targetTrackLower.length > 3) {
    titleScore = 40; // 包含预处理歌名
  } else if (targetTrackLower.includes(songTitle) && songTitle.length > 3) {
    titleScore = 30; // 被预处理歌名包含
  }
  
  // 计算艺术家匹配分数
  const songArtistsArray = songArtists.split(/\s*,\s*|\s+&\s+/);
  
  for (const targetArtist of artists) {
    const targetArtistLower = targetArtist.toLowerCase();
    
    for (const songArtist of songArtistsArray) {
      if (songArtist === originalArtistNameLower) {
        artistScore = Math.max(artistScore, 100); // 完全匹配原始艺术家名
        break;
      } else if (songArtist === targetArtistLower) {
        artistScore = Math.max(artistScore, 80); // 完全匹配预处理艺术家名
        break;
      } else if (songArtist.includes(originalArtistNameLower) || originalArtistNameLower.includes(songArtist)) {
        artistScore = Math.max(artistScore, 60); // 部分匹配原始艺术家名
        break;
      } else if (songArtist.includes(targetArtistLower) || targetArtistLower.includes(songArtist)) {
        artistScore = Math.max(artistScore, 40); // 部分匹配预处理艺术家名
        break;
      }
    }
  }
  
  // 计算综合分数 - 使用动态权重
  let titleWeight = 0.6;
  let artistWeight = 0.4;
  
  // 如果艺术家完全匹配但歌曲名部分匹配，增加艺术家权重
  if (artistScore >= 80 && titleScore >= 40) {
    titleWeight = 0.4;
    artistWeight = 0.6;
  }
  
  // 如果歌曲名完全匹配但艺术家部分匹配，增加歌曲名权重
  if (titleScore >= 90 && artistScore >= 40) {
    titleWeight = 0.8;
    artistWeight = 0.2;
  }
  
  let totalScore = (titleScore * titleWeight) + (artistScore * artistWeight);
  
  // 特殊情况处理
  // 如果歌曲名完全匹配原始歌名，给予最高优先级
  if (songTitle === originalTrackNameLower) {
    totalScore = Math.max(totalScore, 95);
  }
  
  // 如果歌曲名和艺术家都匹配得很好，给予额外奖励
  if (titleScore >= 70 && artistScore >= 80) {
    totalScore += 15;
  }
  
  // 如果艺术家完全匹配但歌曲名部分匹配，给予中等奖励
  if (artistScore === 100 && titleScore >= 40) {
    totalScore += 10;
  }
  
  return totalScore;
}

// 判断是否为接近匹配
function isCloseMatch(songTitle, targetTitle) {
  // 移除常见修饰词
  const cleanSong = songTitle.replace(/\(.*?\)| - .*|【.*?】/g, '').trim();
  const cleanTarget = targetTitle.replace(/\(.*?\)| - .*|【.*?】/g, '').trim();
  
  // 如果清理后相同，则是接近匹配
  if (cleanSong === cleanTarget) {
    return true;
  }
  
  // 如果是日文/中文歌曲，检查是否包含核心部分
  const hasJapaneseOrChinese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(targetTitle);
  if (hasJapaneseOrChinese) {
    const corePart = extractCorePart(targetTitle);
    if (songTitle.includes(corePart)) {
      return true;
    }
  }
  
  return false;
}

// 提取核心部分（日文/中文）
function extractCorePart(text) {
  const japaneseOrChineseMatch = text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/);
  return japaneseOrChineseMatch ? japaneseOrChineseMatch[0] : text.split(/\s+/)[0];
}

// 获取歌曲名称
function getSongName(song) {
  const name = song.song || song.name || song.songname || song.title || song.songName;
  console.log(`获取歌曲名称: ${name}`);
  return name;
}

// 提取歌手信息
function extractArtists(song) {
  if (!song.singer) {
    console.log('歌曲无歌手信息');
    return '';
  }
  
  let result = '';
  
  if (Array.isArray(song.singer)) {
    result = song.singer.map(s => {
      if (typeof s === 'object') return s.name || s.title || s.singer_name || '';
      return String(s);
    }).filter(Boolean).join(', ');
  } else if (typeof song.singer === 'object') {
    result = song.singer.name || song.singer.title || song.singer.singer_name || '';
  } else {
    result = String(song.singer);
  }
  
  console.log(`提取歌手信息: ${result}`);
  return result;
}

// 提取专辑信息
function extractAlbumName(song) {
  if (!song.album) {
    console.log('歌曲无专辑信息');
    return '';
  }
  
  let result = '';
  if (typeof song.album === 'object') {
    result = song.album.name || song.album.title || '';
  } else {
    result = String(song.album);
  }
  
  console.log(`提取专辑信息: ${result}`);
  return result;
}

// 计算时长
function calculateDuration(interval) {
  console.log(`计算时长，输入: ${interval}, 类型: ${typeof interval}`);
  
  if (!interval) {
    console.log('无时长信息，返回0');
    return 0;
  }
  
  if (typeof interval === 'string') {
    if (interval.includes('分') && interval.includes('秒')) {
      const match = interval.match(/(\d+)分(\d+)秒/);
      if (match) {
        const duration = parseInt(match[1]) * 60 + parseInt(match[2]);
        console.log(`解析时长: ${interval} -> ${duration}秒`);
        return duration;
      }
    } else if (interval.includes(':')) {
      const [minutes, seconds] = interval.split(':').map(Number);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        const duration = minutes * 60 + seconds;
        console.log(`解析时长: ${interval} -> ${duration}秒`);
        return duration;
      }
    } else if (!isNaN(Number(interval))) {
      const duration = Number(interval);
      console.log(`解析时长: ${interval} -> ${duration}秒`);
      return duration;
    }
  } else if (typeof interval === 'number') {
    console.log(`数值时长: ${interval}秒`);
    return interval;
  }
  
  console.log(`无法解析时长: ${interval}，返回0`);
  return 0;
}

// 使用官方API获取歌词
async function getLyrics(songMid) {
  console.log(`\n========== 开始获取歌词 ==========`);
  console.log(`歌曲MID: ${songMid}`);
  
  try {
    const currentMillis = Date.now();
    const callback = 'MusicJsonCallback_lrc';
    
    console.log('准备普通歌词API请求...');
    const params = new URLSearchParams({
      callback: callback,
      pcachetime: currentMillis.toString(),
      songmid: songMid,
      g_tk: '5381',
      jsonpCallback: callback,
      loginUin: '0',
      hostUin: '0',
      format: 'jsonp',
      inCharset: 'utf8',
      outCharset: 'utf8',
      notice: '0',
      platform: 'yqq',
      needNewCode: '0'
    });
    
    const response = await axios.get(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?${params}`, {
      headers: {
        'Referer': 'https://c.y.qq.com/'
      }
    });
    
    console.log('普通歌词API响应状态:', response.status);
    console.log('响应长度:', response.data.length);
    
    let data = response.data;
    
    // 处理JSONP响应
    if (data.startsWith(callback)) {
      console.log('检测到JSONP响应，进行解析');
      data = data.replace(callback + '(', '').slice(0, -1);
    }
    
    console.log('解析响应数据...');
    const lyricData = JSON.parse(data);
    
    let syncedLyrics = '';
    let plainLyrics = '';
    let translatedLyrics = '';
    let yrcLyrics = ''; // 新增：逐字歌词
    
    if (lyricData.lyric) {
      console.log('找到普通歌词，解码Base64...');
      // 解码Base64歌词
      const decodedLyric = Buffer.from(lyricData.lyric, 'base64').toString('utf-8');
      console.log('解码后普通歌词长度:', decodedLyric.length);
      syncedLyrics = filterLyricsWithNewRules(decodedLyric);
      console.log('过滤后普通歌词长度:', syncedLyrics.length);
      plainLyrics = '';
    } else {
      console.log('未找到普通歌词');
    }
    
    if (lyricData.trans) {
      console.log('找到翻译歌词，解码Base64...');
      // 解码Base64翻译歌词
      const decodedTrans = Buffer.from(lyricData.trans, 'base64').toString('utf-8');
      console.log('解码后翻译歌词长度:', decodedTrans.length);
      translatedLyrics = filterLyricsWithNewRules(decodedTrans);
      console.log('过滤后翻译歌词长度:', translatedLyrics.length);
    } else {
      console.log('未找到翻译歌词');
    }
    
    // 新增：获取逐字歌词
    try {
      console.log('\n开始获取逐字歌词...');
      yrcLyrics = await getYrcLyrics(songMid);
      console.log('逐字歌词获取完成，长度:', yrcLyrics?.length || 0);
    } catch (error) {
      console.warn('获取逐字歌词失败:', error.message);
      yrcLyrics = '';
    }
    
    console.log('========== 歌词获取完成 ==========\n');
    return { syncedLyrics, plainLyrics, translatedLyrics, yrcLyrics };
    
  } catch (error) {
    console.error('获取歌词失败:', error);
    return { 
      syncedLyrics: '', 
      plainLyrics: '', 
      translatedLyrics: '',
      yrcLyrics: ''
    };
  }
}

// 新增：获取逐字歌词（YRC格式）
async function getYrcLyrics(songMid) {
  console.log('\n[逐字歌词] 开始获取逐字歌词...');
  
  try {
    // 通过歌词下载接口获取逐字歌词
    console.log(`[逐字歌词] 请求MID: ${songMid}`);
    
    const params = new URLSearchParams({
      version: '15',
      miniversion: '82',
      lrctype: '4', // 逐字歌词类型
      musicid: songMid,
    });
    
    console.log('[逐字歌词] 准备发送请求...');
    const response = await axios.post('https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg', params.toString(), {
      headers: {
        'Referer': 'https://c.y.qq.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/63.0.3239.132 Safari/537.36'
      },
      timeout: 10000 // 10秒超时
    });
    
    console.log(`[逐字歌词] 响应状态: ${response.status}`);
    console.log(`[逐字歌词] 响应长度: ${response.data.length}`);
    
    let xmlContent = response.data;
    console.log(`[逐字歌词] 原始响应前200字符: ${xmlContent.substring(0, 200)}...`);
    
    // 移除XML注释
    xmlContent = xmlContent.replace(/<!--[\s\S]*?-->/g, '');
    console.log(`[逐字歌词] 移除注释后长度: ${xmlContent.length}`);
    
    // 提取加密的歌词内容
    console.log('[逐字歌词] 提取加密歌词...');
    const encryptedLyrics = extractEncryptedLyricsFromXml(xmlContent);
    
    if (!encryptedLyrics) {
      console.warn('[逐字歌词] 未找到加密的逐字歌词');
      return '';
    }
    
    console.log(`[逐字歌词] 加密歌词长度: ${encryptedLyrics.length}`);
    console.log(`[逐字歌词] 加密歌词前100字符: ${encryptedLyrics.substring(0, 100)}...`);
    
    // 解密歌词
    console.log('[逐字歌词] 开始解密...');
    const decryptedLyrics = decryptYrcLyrics(encryptedLyrics);
    
    if (!decryptedLyrics) {
      console.warn('[逐字歌词] 解密失败，返回空字符串');
      return '';
    }
    
    console.log(`[逐字歌词] 解密后长度: ${decryptedLyrics.length}`);
    console.log(`[逐字歌词] 解密后前500字符: ${decryptedLyrics.substring(0, 500)}...`);
    
    // 提取并格式化逐字歌词
    console.log('[逐字歌词] 提取并格式化逐字歌词...');
    const formattedYrc = extractYrcFromDecrypted(decryptedLyrics);
    
    console.log(`[逐字歌词] 格式化后长度: ${formattedYrc.length}`);
    console.log('[逐字歌词] 获取完成');
    
    return formattedYrc;
    
  } catch (error) {
    console.error('[逐字歌词] 获取失败:', error.message);
    console.error('[逐字歌词] 错误堆栈:', error.stack);
    return '';
  }
}

// 新增：从XML中提取加密的歌词内容
function extractEncryptedLyricsFromXml(xmlContent) {
  console.log('[逐字歌词] 从XML提取加密歌词...');
  
  try {
    // 使用正则表达式提取<content>标签内容
    const contentMatch = xmlContent.match(/<content>([^<]+)<\/content>/);
    if (contentMatch && contentMatch[1]) {
      console.log('[逐字歌词] 找到<content>标签内容');
      return contentMatch[1];
    }
    
    // 尝试其他可能的标签
    console.log('[逐字歌词] 未找到<content>，尝试<contentts>...');
    const contentTsMatch = xmlContent.match(/<contentts>([^<]+)<\/contentts>/);
    if (contentTsMatch && contentTsMatch[1]) {
      console.log('[逐字歌词] 找到<contentts>标签内容');
      return contentTsMatch[1];
    }
    
    console.log('[逐字歌词] 未找到加密歌词标签');
    return null;
  } catch (error) {
    console.error('[逐字歌词] 提取加密歌词失败:', error.message);
    return null;
  }
}

// 新增：解密逐字歌词（基于C#版本的JavaScript实现）
function decryptYrcLyrics(encryptedLyrics) {
  console.log('[逐字歌词] 开始解密...');
  
  try {
    // 将十六进制字符串转换为字节数组
    console.log('[逐字歌词] 转换十六进制字符串...');
    const encryptedBytes = hexStringToByteArray(encryptedLyrics);
    console.log(`[逐字歌词] 加密字节数组长度: ${encryptedBytes.length}`);
    
    // TripleDES解密
    console.log('[逐字歌词] 进行TripleDES解密...');
    const decryptedBytes = tripleDesDecrypt(encryptedBytes);
    console.log(`[逐字歌词] 解密后字节数组长度: ${decryptedBytes.length}`);
    
    // 解压缩
    console.log('[逐字歌词] 解压缩数据...');
    const decompressedBytes = decompressData(decryptedBytes);
    console.log(`[逐字歌词] 解压缩后字节数组长度: ${decompressedBytes.length}`);
    
    // 转换为UTF-8字符串
    console.log('[逐字歌词] 转换为UTF-8字符串...');
    const result = Buffer.from(decompressedBytes).toString('utf-8');
    console.log('[逐字歌词] 解密完成');
    
    return result;
  } catch (error) {
    console.error('[逐字歌词] 解密失败:', error.message);
    console.error('[逐字歌词] 解密错误堆栈:', error.stack);
    return '';
  }
}

// 新增：十六进制字符串转字节数组
function hexStringToByteArray(hexString) {
  console.log(`[逐字歌词] 十六进制转字节数组，输入长度: ${hexString.length}`);
  
  if (hexString.length % 2 !== 0) {
    console.warn(`[逐字歌词] 警告: 十六进制字符串长度不是偶数: ${hexString.length}`);
  }
  
  const result = [];
  for (let i = 0; i < hexString.length; i += 2) {
    const byteStr = hexString.substr(i, 2);
    const byteValue = parseInt(byteStr, 16);
    
    if (isNaN(byteValue)) {
      console.warn(`[逐字歌词] 警告: 无法解析十六进制字节: ${byteStr}`);
      result.push(0);
    } else {
      result.push(byteValue);
    }
  }
  
  console.log(`[逐字歌词] 字节数组长度: ${result.length}`);
  return result;
}

// 新增：TripleDES解密（简化版，实际需要完整实现）
function tripleDesDecrypt(inputBytes) {
  console.log('[逐字歌词] 开始TripleDES解密...');
  
  try {
    const crypto = require('crypto');
    
    // QQ音乐密钥
    const keyStr = '!@#)(*$%123ZXC!@!@#)(NHL';
    console.log(`[逐字歌词] 原始密钥字符串: ${keyStr}, 长度: ${keyStr.length}`);
    
    // 将密钥字符串转换为Buffer
    const key = Buffer.from(keyStr, 'ascii');
    console.log(`[逐字歌词] 密钥Buffer长度: ${key.length}`);
    
    // 检查密钥长度，TripleDES需要24字节密钥
    if (key.length < 24) {
      console.warn(`[逐字歌词] 警告: 密钥长度(${key.length})小于24字节，进行填充`);
      // 创建24字节的Buffer，用0填充
      const paddedKey = Buffer.alloc(24, 0);
      key.copy(paddedKey);
      key = paddedKey;
    } else if (key.length > 24) {
      console.warn(`[逐字歌词] 警告: 密钥长度(${key.length})大于24字节，进行截断`);
      key = key.slice(0, 24);
    }
    
    console.log(`[逐字歌词] 最终密钥长度: ${key.length}`);
    console.log(`[逐字歌词] 输入字节长度: ${inputBytes.length}`);
    
    // 使用ECB模式，不需要IV
    console.log('[逐字歌词] 创建解密器...');
    const decipher = crypto.createDecipheriv('des-ede3-ecb', key, Buffer.alloc(0));
    decipher.setAutoPadding(true);
    
    console.log('[逐字歌词] 执行解密...');
    const inputBuffer = Buffer.from(inputBytes);
    const decrypted = Buffer.concat([
      decipher.update(inputBuffer),
      decipher.final()
    ]);
    
    console.log(`[逐字歌词] 解密后字节长度: ${decrypted.length}`);
    return decrypted;
    
  } catch (error) {
    console.error('[逐字歌词] TripleDES解密失败:', error.message);
    throw error;
  }
}

// 新增：解压缩数据（使用zlib）
function decompressData(compressedData) {
  console.log('[逐字歌词] 开始解压缩...');
  
  try {
    const zlib = require('zlib');
    
    console.log(`[逐字歌词] 压缩数据长度: ${compressedData.length}`);
    
    // 尝试inflate解压缩
    console.log('[逐字歌词] 尝试inflate解压缩...');
    try {
      const result = zlib.inflateSync(Buffer.from(compressedData));
      console.log(`[逐字歌词] inflate解压缩成功，长度: ${result.length}`);
      return result;
    } catch (inflateError) {
      console.log(`[逐字歌词] inflate失败: ${inflateError.message}`);
      
      // 尝试inflateRaw解压缩
      console.log('[逐字歌词] 尝试inflateRaw解压缩...');
      try {
        const result = zlib.inflateRawSync(Buffer.from(compressedData));
        console.log(`[逐字歌词] inflateRaw解压缩成功，长度: ${result.length}`);
        return result;
      } catch (inflateRawError) {
        console.log(`[逐字歌词] inflateRaw失败: ${inflateRawError.message}`);
        
        // 尝试gunzip解压缩
        console.log('[逐字歌词] 尝试gunzip解压缩...');
        try {
          const result = zlib.gunzipSync(Buffer.from(compressedData));
          console.log(`[逐字歌词] gunzip解压缩成功，长度: ${result.length}`);
          return result;
        } catch (gunzipError) {
          console.log(`[逐字歌词] gunzip失败: ${gunzipError.message}`);
          throw new Error('所有解压缩方法都失败');
        }
      }
    }
  } catch (error) {
    console.error('[逐字歌词] 解压缩失败:', error.message);
    throw error;
  }
}

// 新增：从解密后的内容中提取逐字歌词
function extractYrcFromDecrypted(decryptedContent) {
  console.log('[逐字歌词] 从解密内容提取逐字歌词...');
  console.log(`[逐字歌词] 解密内容长度: ${decryptedContent.length}`);
  
  if (!decryptedContent) {
    console.log('[逐字歌词] 解密内容为空');
    return '';
  }
  
  try {
    // 检查是否是XML格式
    if (decryptedContent.includes('<?xml') || decryptedContent.includes('<lyric')) {
      console.log('[逐字歌词] 检测到XML格式内容');
      
      // 提取LyricContent属性
      const lyricContentMatch = decryptedContent.match(/LyricContent="([^"]+)"/);
      if (lyricContentMatch && lyricContentMatch[1]) {
        console.log(`[逐字歌词] 找到LyricContent属性，长度: ${lyricContentMatch[1].length}`);
        return formatYrcLyrics(lyricContentMatch[1]);
      }
      
      // 尝试其他可能的格式
      console.log('[逐字歌词] 尝试其他XML提取方法...');
      
      // 尝试提取<lyric>标签内容
      const lyricTagMatch = decryptedContent.match(/<lyric[^>]*>([\s\S]*?)<\/lyric>/i);
      if (lyricTagMatch && lyricTagMatch[1]) {
        console.log(`[逐字歌词] 找到<lyric>标签内容，长度: ${lyricTagMatch[1].length}`);
        return formatYrcLyrics(lyricTagMatch[1]);
      }
      
      // 尝试提取CDATA内容
      const cdataMatch = decryptedContent.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      if (cdataMatch && cdataMatch[1]) {
        console.log(`[逐字歌词] 找到CDATA内容，长度: ${cdataMatch[1].length}`);
        return formatYrcLyrics(cdataMatch[1]);
      }
    }
    
    // 如果不是XML，直接返回格式化后的内容
    console.log('[逐字歌词] 非XML格式，直接格式化');
    return formatYrcLyrics(decryptedContent);
  } catch (error) {
    console.error('[逐字歌词] 提取逐字歌词失败:', error.message);
    console.log(`[逐字歌词] 返回原始解密内容前500字符: ${decryptedContent.substring(0, 500)}`);
    return decryptedContent;
  }
}

// 新增：格式化逐字歌词
function formatYrcLyrics(yrcContent) {
  console.log('[逐字歌词] 格式化逐字歌词...');
  
  if (!yrcContent) {
    console.log('[逐字歌词] 内容为空');
    return '';
  }
  
  console.log(`[逐字歌词] 原始内容长度: ${yrcContent.length}`);
  
  // 基本的格式化处理
  const lines = yrcContent.split('\n');
  console.log(`[逐字歌词] 原始行数: ${lines.length}`);
  
  const formattedLines = lines.map((line, index) => {
    // 去除多余的空格
    const trimmedLine = line.trim();
    
    // 跳过空行
    if (trimmedLine.length === 0) {
      return null;
    }
    
    // 记录非空行
    if (index < 5) { // 只记录前5行用于调试
      console.log(`[逐字歌词] 原始行 ${index}: ${trimmedLine.substring(0, 100)}...`);
    }
    
    return trimmedLine;
  }).filter(line => line !== null);
  
  console.log(`[逐字歌词] 格式化后行数: ${formattedLines.length}`);
  console.log(`[逐字歌词] 格式化后内容长度: ${formattedLines.join('\n').length}`);
  
  const result = formattedLines.join('\n');
  console.log(`[逐字歌词] 最终结果长度: ${result.length}`);
  
  return result;
}

// 使用新的过滤规则处理歌词
function filterLyricsWithNewRules(lyricContent) {
  console.log('[歌词过滤] 开始过滤歌词...');
  
  if (!lyricContent) {
    console.log('[歌词过滤] 歌词内容为空');
    return '';
  }
  
  console.log(`[歌词过滤] 原始歌词长度: ${lyricContent.length}`);
  
  // 1) 将歌词按行分割，处理 Windows 换行符 \r\n
  const lines = lyricContent.replace(/\r\n/g, '\n').split('\n');
  console.log(`[歌词过滤] 原始行数: ${lines.length}`);
  
  // 首先移除所有的标签行（[ti:], [ar:], [al:], [by:], [offset:] 等）
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    // 移除所有标签行，但保留有时间轴的歌词行
    return !(/^\[(ti|ar|al|by|offset|t_time|kana|lang|total):.*\]$/i.test(trimmed));
  });
  
  console.log(`[歌词过滤] 移除标签行后行数: ${filteredLines.length}`);
  
  // 解析每行，提取时间戳和文本内容
  const parsedLines = [];
  for (const line of filteredLines) {
    const match = line.match(/^(\[[0-9:.]+\])(.*)$/);
    if (match) {
      parsedLines.push({
        raw: line,
        timestamp: match[1],
        text: match[2].trim(),
        plainText: match[2].trim().replace(/\[.*?\]/g, '') // 移除内嵌标签的纯文本
      });
    }
  }
  
  console.log(`[歌词过滤] 解析后有效行数: ${parsedLines.length}`);
  
  // 2) 基础序列 - 按时间戳排序
  let filtered = [...parsedLines];
  
  // 收集"被删除的冒号行"的纯文本
  let removedColonPlainTexts = [];
  
  // 2) A) 标题行（仅前三行内；含 '-' 就删）
  let i = 0;
  let scanLimit = Math.min(3, filtered.length);
  console.log(`[歌词过滤] 检查前三行，共${scanLimit}行`);
  
  while (i < scanLimit) {
    const text = filtered[i].plainText;
    if (text.includes('-')) {
      console.log(`[歌词过滤] 删除含'-'的行: ${text.substring(0, 50)}...`);
      filtered.splice(i, 1);
      scanLimit = Math.min(3, filtered.length);
      continue;
    } else {
      i += 1;
    }
  }
  
  // 2.5) A2) 前三行内：含冒号的行直接删除
  let removedA2Colon = false;
  i = 0;
  scanLimit = Math.min(3, filtered.length);
  console.log(`[歌词过滤] 检查前三行冒号，共${scanLimit}行`);
  
  while (i < scanLimit) {
    const text = filtered[i].plainText;
    if (containsColon(text)) {
      console.log(`[歌词过滤] 删除含冒号的行: ${text.substring(0, 50)}...`);
      removedColonPlainTexts.push(text);
      filtered.splice(i, 1);
      removedA2Colon = true;
      scanLimit = Math.min(3, filtered.length);
      continue;
    } else {
      i += 1;
    }
  }
  
  // 3) B0) 处理"开头连续冒号行"
  let leading = 0;
  while (leading < filtered.length) {
    const text = filtered[leading].plainText;
    if (containsColon(text)) {
      leading += 1;
    } else {
      break;
    }
  }
  
  console.log(`[歌词过滤] 开头连续冒号行数: ${leading}`);
  
  if (removedA2Colon) {
    if (leading >= 1) {
      console.log(`[歌词过滤] 删除开头${leading}行冒号行`);
      for (let idx = 0; idx < leading; idx++) {
        removedColonPlainTexts.push(filtered[idx].plainText);
      }
      filtered.splice(0, leading);
    }
  } else {
    if (leading >= 2) {
      console.log(`[歌词过滤] 删除开头${leading}行冒号行`);
      for (let idx = 0; idx < leading; idx++) {
        removedColonPlainTexts.push(filtered[idx].plainText);
      }
      filtered.splice(0, leading);
    }
  }
  
  // 3) 制作行（全局）：删除任意位置出现的"连续 ≥2 行均含冒号"的区间
  let newFiltered = [];
  i = 0;
  while (i < filtered.length) {
    const text = filtered[i].plainText;
    if (containsColon(text)) {
      // 统计这一段连续"含冒号"的长度
      let j = i;
      while (j < filtered.length) {
        const tj = filtered[j].plainText;
        if (containsColon(tj)) {
          j += 1;
        } else {
          break;
        }
      }
      const runLen = j - i;
      if (runLen >= 2) {
        console.log(`[歌词过滤] 删除连续${runLen}行冒号行，从第${i}行开始`);
        // 收集整段 i..<(i+runLen) 的纯文本后丢弃
        for (let k = i; k < j; k++) {
          removedColonPlainTexts.push(filtered[k].plainText);
        }
        i = j;
      } else {
        // 仅 1 行，保留
        newFiltered.push(filtered[i]);
        i = j;
      }
    } else {
      newFiltered.push(filtered[i]);
      i += 1;
    }
  }
  filtered = newFiltered;
  
  // 4) C) 全局删除：凡包含【】或 [] 的行一律删除
  const beforeBracketFilter = filtered.length;
  filtered = filtered.filter(line => !containsBracketTag(line.plainText));
  console.log(`[歌词过滤] 删除括号标签行数: ${beforeBracketFilter - filtered.length}`);
  
  // 4.5) C2) 处理开头两行的"圆括号标签"
  i = 0;
  scanLimit = Math.min(2, filtered.length);
  console.log(`[歌词过滤] 检查开头两行圆括号，共${scanLimit}行`);
  
  while (i < scanLimit) {
    const text = filtered[i].plainText;
    if (containsParenPair(text)) {
      console.log(`[歌词过滤] 删除含圆括号的行: ${text.substring(0, 50)}...`);
      filtered.splice(i, 1);
      scanLimit = Math.min(2, filtered.length);
      continue;
    } else {
      i += 1;
    }
  }
  
  // 4.75) D) 全局删除：版权/授权/禁止类提示语
  const beforeLicenseFilter = filtered.length;
  filtered = filtered.filter(line => !isLicenseWarningLine(line.plainText));
  console.log(`[歌词过滤] 删除版权行数: ${beforeLicenseFilter - filtered.length}`);
  
  // 5) 额外的清理步骤：移除空时间轴行和只有"//"的行
  const beforeFinalFilter = filtered.length;
  filtered = filtered.filter(line => {
    const text = line.plainText;
    
    // 移除空行
    if (text === '') {
      return false;
    }
    
    // 移除只包含"//"的行
    if (text === '//') {
      return false;
    }
    
    // 移除只包含时间轴后面只有"//"的行（如 [00:36.66]//）
    if (/^\/\/\s*$/.test(text) || /^\[\d+:\d+(\.\d+)?\]\s*\/\/\s*$/.test(line.raw)) {
      return false;
    }
    
    // 移除只有时间轴的空行（如 [00:23.53]）
    if (/^\[\d+:\d+(\.\d+)?\]\s*$/.test(line.raw)) {
      return false;
    }
    
    return true;
  });
  
  console.log(`[歌词过滤] 最终清理行数: ${beforeFinalFilter - filtered.length}`);
  console.log(`[歌词过滤] 最终剩余行数: ${filtered.length}`);
  
  // 重新组合成LRC格式
  const result = filtered.map(line => line.raw).join('\n');
  console.log(`[歌词过滤] 最终歌词长度: ${result.length}`);
  console.log('[歌词过滤] 过滤完成');
  
  return result;
}

// 辅助函数 - 检查是否包含冒号（中英文冒号）
function containsColon(text) {
  return text.includes(':') || text.includes('：');
}

// 辅助函数 - 检查是否包含括号标签
function containsBracketTag(text) {
  const hasHalfPair = text.includes('[') && text.includes(']');
  const hasFullPair = text.includes('【') && text.includes('】');
  return hasHalfPair || hasFullPair;
}

// 辅助函数 - 检查是否包含圆括号对
function containsParenPair(text) {
  const hasHalfPair = text.includes('(') && text.includes(')');
  const hasFullPair = text.includes('（') && text.includes('）');
  return hasHalfPair || hasFullPair;
}

// 辅助函数 - 检查是否是版权警告行
function isLicenseWarningLine(text) {
  if (!text) return false;
  
  // 特殊关键词 - 只要包含这些词就直接认为是版权行
  const specialKeywords = ['文曲大模型', '享有本翻译作品的著作权'];
  for (const keyword of specialKeywords) {
    if (text.includes(keyword)) return true;
  }
  
  // 普通关键词 - 需要命中多个才认为是版权行
  const tokens = ['未经', '许可', '授权', '不得', '请勿', '使用', '版权', '翻唱'];
  let count = 0;
  for (const token of tokens) {
    if (text.includes(token)) count += 1;
  }
  return count >= 3; // 降低阈值到3
}
