const axios = require('axios');
const cheerio = require('cheerio');
const core = require('@actions/core');

const version = process.argv[2];

if (!version) {
  core.setFailed('OpenWrt version is required (e.g. 25.12.0-rc4 or 25.12.0)');
  process.exit(1);
}

// Только OpenWrt 25.x
if (!/^25\.\d+\.\d+(-rc\d+)?$/.test(version)) {
  core.setFailed(`Unsupported OpenWrt version: ${version}`);
  process.exit(1);
}

// Под ASUS RT-AC58U
const TARGET = 'ipq40xx';
const SUBTARGET = 'generic';

const PACKAGES_URL =
  `https://downloads.openwrt.org/releases/${version}/targets/${TARGET}/${SUBTARGET}/packages/`;

async function fetchHTML(url) {
  const { data } = await axios.get(url, {
    timeout: 15000,
    validateStatus: s => s === 200
  });
  return cheerio.load(data);
}

async function getKernelInfo() {
  const $ = await fetchHTML(PACKAGES_URL);

  const links = $('a').map((_, el) => $(el).attr('href')).get();
  const apkFiles = links.filter(n => n && n.endsWith('.apk'));

  if (apkFiles.length === 0) {
    throw new Error('Packages directory is empty (build not ready yet)');
  }

  // Ищем файл ядра. Формат: kernel-6.12.74~HASH-r1.apk
  for (const name of apkFiles) {
    const match = name.match(/^kernel-[\d.]+~([a-f0-9]+)-r\d+\.apk$/);
    if (match) {
      return {
        vermagic: match[1],
        pkgarch: 'arm_cortex-a7_neon-vfpv4', // задаём вручную
      };
    }
  }

  throw new Error('Kernel package not found in packages directory');
}

async function main() {
  try {
    core.info(`OpenWrt version : ${version}`);
    core.info(`Target          : ${TARGET}/${SUBTARGET}`);
    core.info(`Packages URL    : ${PACKAGES_URL}`);

    const { vermagic, pkgarch } = await getKernelInfo();

    core.setOutput(
      'job-config',
      JSON.stringify([{
        tag: version,
        target: TARGET,
        subtarget: SUBTARGET,
        vermagic,
        pkgarch,
      }])
    );
  } catch (err) {
    core.setFailed(err.message);
  }
}

main();
