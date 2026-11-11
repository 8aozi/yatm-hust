const fs = require('node:fs');
const path = require('node:path');

const valid = (value, limit) =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
const hasCoordinates = value => valid(value.lat, 90) && valid(value.lon, 180);

function normalizeConfig(input) {
  const config = { ...input };
  if (config.locations === undefined) {
    config.locations = hasCoordinates(config)
      ? [{ name: '原有定位', lat: config.lat, lon: config.lon }]
      : [];
  }
  if (!Array.isArray(config.locations)) throw new Error('locations 必须是地点列表。');
  const names = new Set();
  config.locations = config.locations.map(location => {
    if (!location || typeof location.name !== 'string' || !location.name.trim() || !hasCoordinates(location)) {
      throw new Error('地点必须有名称、有效纬度（-90～90）和经度（-180～180）。');
    }
    const name = location.name.trim();
    if (names.has(name)) throw new Error(`地点名称重复：${name}`);
    names.add(name);
    return { ...location, name };
  });
  if (config.selectedLocation !== undefined && !names.has(config.selectedLocation)) {
    throw new Error('默认地点不存在，请检查 selectedLocation。');
  }
  config.selectedLocation ??= config.locations[0]?.name;
  return config;
}

function selectLocation(config, name) {
  const location = config.locations.find(item => item.name === name);
  if (!location) throw new Error(`找不到定位预设：${name}`);
  config.selectedLocation = location.name;
  config.lat = location.lat;
  config.lon = location.lon;
  return location;
}

function runConfigure({ configPath, edit = false, interactive = process.stdin.isTTY,
  requestedLocation, ask = prompt => require('readline-sync').question(prompt), log = console.log }) {
  const input = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : { interval: 10000, wait: 5000, qr: { mode: 'terminal' } };
  const config = normalizeConfig(input);
  const save = () => {
    selectLocation(config, config.selectedLocation);
    const temporary = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, configPath);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  };
  const answer = prompt => ask(prompt).trim();
  const list = () => {
    config.locations.forEach((location, index) => {
      log(`${index + 1}. ${location.name} — 纬度 ${location.lat}，经度 ${location.lon}${location.name === config.selectedLocation ? '（上次选择）' : ''}`);
    });
  };
  const pick = prompt => {
    list();
    for (;;) {
      const value = answer(`${prompt}（输入编号，0 返回）：`);
      if (value === '0') return undefined;
      if (/^[1-9]\d*$/.test(value) && Number(value) <= config.locations.length) {
        return config.locations[Number(value) - 1];
      }
      log('请输入列表中的编号。');
    }
  };
  const readLocation = original => {
    let name;
    for (;;) {
      name = answer(`地点名称${original ? ` [${original.name}]` : ''}：`) || original?.name;
      if (name && !config.locations.some(item => item !== original && item.name === name)) break;
      log('名称不能为空，也不能与已有地点重名。');
    }
    const result = { name };
    for (const [key, label, limit] of [['lat', '纬度', 90], ['lon', '经度', 180]]) {
      for (;;) {
        const value = answer(`${label}${original ? ` [${original[key]}]` : ''}：`);
        const number = value === '' ? original?.[key] : Number(value);
        if (valid(number, limit)) { result[key] = number; break; }
        log(`请输入 -${limit}～${limit} 范围内的数字。`);
      }
    }
    return result;
  };
  const add = () => {
    log('填写实际签到地点坐标；程序不会读取或自动更新当前位置。');
    const location = readLocation();
    config.locations.push(location);
    config.selectedLocation = location.name;
    return location;
  };
  const manage = () => {
    for (;;) {
      log('\n定位预设管理');
      list();
      const action = answer('1 新增 / 2 修改 / 3 删除 / 4 设为默认 / 0 保存并返回：');
      if (action === '0') {
        if (!config.locations.length) { log('请先新增至少一个地点。'); continue; }
        save();
        return;
      }
      if (action === '1') add();
      else if (['2', '3', '4'].includes(action)) {
        if (!config.locations.length) { log('请先新增地点。'); continue; }
        if (action === '3' && config.locations.length === 1) { log('至少保留一个地点，可选择修改。'); continue; }
        const selected = pick('选择要操作的地点');
        if (!selected) continue;
        if (action === '2') {
          const updated = readLocation(selected);
          if (config.selectedLocation === selected.name) config.selectedLocation = updated.name;
          config.locations[config.locations.indexOf(selected)] = updated;
        } else if (action === '3') {
          config.locations = config.locations.filter(item => item !== selected);
          if (config.selectedLocation === selected.name) config.selectedLocation = config.locations[0].name;
          log(`已删除预设：${selected.name}`);
        } else config.selectedLocation = selected.name;
      } else { log('请输入菜单中的选项。'); continue; }
      save();
    }
  };

  if (edit) {
    if (!interactive) throw new Error('请在交互终端运行 npm run configure 来管理定位预设。');
    manage();
    return config;
  }
  if (requestedLocation) {
    selectLocation(config, requestedLocation);
  } else if (interactive) {
    if (!config.locations.length) add();
    for (;;) {
      log('\n选择本次签到地点');
      list();
      const value = answer('输入编号；回车沿用上次选择；M 管理预设；Q 退出：');
      if (value.toLowerCase() === 'q') return null;
      if (value.toLowerCase() === 'm') { manage(); continue; }
      if (value === '') break;
      if (/^[1-9]\d*$/.test(value) && Number(value) <= config.locations.length) {
        config.selectedLocation = config.locations[Number(value) - 1].name;
        break;
      }
      log('请输入列表编号、M 或 Q。');
    }
  } else if (!config.locations.length) {
    throw new Error('尚无定位预设，请先在终端运行 npm run configure。');
  }
  save();
  log(`本次使用：${config.selectedLocation}（纬度 ${config.lat}，经度 ${config.lon}）。`);
  log('二维码出现后，请用微信扫描；openId 失效时需重新获取。按 Control+C 停止。');
  return config;
}

module.exports = { normalizeConfig, selectLocation, runConfigure };
if (require.main === module) {
  try {
    const result = runConfigure({
      configPath: path.resolve(__dirname, '..', 'config.json'),
      edit: process.argv.includes('--edit'),
      requestedLocation: process.env.YATM_LOCATION,
    });
    if (result === null) process.exitCode = 1;
  } catch (error) {
    console.error(`【需要操作】定位配置失败，程序未启动：${error.message}`);
    console.error('  操作：检查并修正 config.json 的格式、坐标和默认地点 or 备份后移走 config.json，再重新启动并配置地点。');
    process.exitCode = 1;
  }
}
