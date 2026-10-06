import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {setDefaultResultOrder} from 'node:dns';
import {chromium} from '@playwright/test';
import {openFixtureBrowser} from './browser-transport.mjs';

// Both Node fetch and Chromium must use the IPv4 listener owned by this run.
setDefaultResultOrder('ipv4first');
export async function launchFixtureBrowser() {
  const project=process.env.COMPOSE_PROJECT_NAME;
  assert.match(project??'',/^solar-ci-[0-9a-f-]{36}$/,'A disposable owned Compose project is required');
  const ids=execFileSync('docker',['ps','-q','--filter',`label=com.docker.compose.project=${project}`],{encoding:'utf8'}).trim().split(/\s+/).filter(Boolean);
  assert.ok(ids.length,'The fixture stack must be running');
  const containers=JSON.parse(execFileSync('docker',['inspect',...ids],{encoding:'utf8'}));
  assert.ok(containers.some(container=>Object.values(container.NetworkSettings.Ports).flatMap(value=>value??[]).some(binding=>binding.HostIp==='127.0.0.1'&&binding.HostPort==='13000')),'Port 13000 must belong to the fixture project');
  return openFixtureBrowser(chromium, process.env);
}
