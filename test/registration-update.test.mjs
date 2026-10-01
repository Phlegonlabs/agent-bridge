import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileProviders } from '../src/provider-registration.mjs';
const original = () => ({ schemaVersion: 1, config: { providerOrder: ['other','workflow-bridge'],
 providerConfigRules: { providerRules: [{providerId:'other', config:{access:{apiKey:'keep'}}}, {providerId:'workflow-bridge',providerName:'old'}] },
 modelConfigRules: { providerModelRules:[{providerId:'other',modelId:'old',config:{enabled:false}},{providerId:'workflow-bridge',modelId:'stale'}], manualProviderModelRules:[{providerId:'other',modelId:'manual'}] } } });
const config = {port:32147,routes:{'gpt-6.1-sol':{provider:'codex',model:'gpt-6.1-sol',reasoning:{values:['low','high'],default:'high'}},'cursor-grok':{provider:'cursor',model:'grok-low',reasoning:{variants:{low:'grok-low',high:'grok-high'}}},'claude-sonnet-5-5':{provider:'claude',model:'claude-sonnet-5-5',mode:'delegate',reasoning:{values:['low','high'],default:'high'}}}};
test('update separates providers and preserves unrelated config and manual overrides',()=>{
 const prior=original(), next=reconcileProviders(prior,config,'local-test');
 assert.deepEqual(next.config.providerConfigRules.providerRules[0],prior.config.providerConfigRules.providerRules[0]);
 assert.deepEqual(next.config.modelConfigRules.manualProviderModelRules,prior.config.modelConfigRules.manualProviderModelRules);
 assert.deepEqual(next.config.modelConfigRules.providerModelRules[0],prior.config.modelConfigRules.providerModelRules[0]);
 assert.deepEqual(next.config.providerConfigRules.providerRules[1].config.personalModelIds,['gpt-6.1-sol','cursor-grok']);
 assert.deepEqual(next.config.providerConfigRules.providerRules[2].config.personalModelIds,['claude-sonnet-5-5']);
 assert.equal(prior.config.providerConfigRules.providerRules.length,2);
 const rule=next.config.modelConfigRules.providerModelRules.find(r=>r.modelId==='gpt-6.1-sol');
 assert.deepEqual(rule.config.optionSpecs.reasoningLevel,{values:['low','high'],map:'{"reasoning_effort": reasoningLevel}'});
 assert.equal(next.config.modelConfigRules.providerModelRules.find(r=>r.providerId==='claude-bridge').config.properties.supportsToolCall,false);
 assert.ok(!next.config.modelConfigRules.providerModelRules.some(r=>r.modelId==='stale'));
 assert.deepEqual(reconcileProviders(next,config,'local-test'),next);
});
