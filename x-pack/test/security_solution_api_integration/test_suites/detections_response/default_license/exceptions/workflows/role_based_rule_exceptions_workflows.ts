/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable @typescript-eslint/naming-convention */

import expect from 'expect';
import type { CreateExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import {
  EXCEPTION_LIST_ITEM_URL,
  EXCEPTION_LIST_URL,
  LIST_URL,
} from '@kbn/securitysolution-list-constants';
import type {
  RuleCreateProps,
  EqlRuleCreateProps,
  QueryRuleCreateProps,
  ThreatMatchRuleCreateProps,
  ThresholdRuleCreateProps,
} from '@kbn/security-solution-plugin/common/api/detection_engine';
import { getCreateExceptionListItemMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_item_schema.mock';
import { getCreateExceptionListMinimalSchemaMock } from '@kbn/lists-plugin/common/schemas/request/create_exception_list_schema.mock';

import { DETECTION_ENGINE_RULES_URL } from '@kbn/security-solution-plugin/common/constants';
import { ROLES } from '@kbn/security-solution-plugin/common/test';
import { ELASTIC_SECURITY_RULE_ID } from '@kbn/security-solution-plugin/common';

import { EsArchivePathBuilder } from '../../../../../es_archive_path_builder';
import {
  createAlertsIndex,
  fetchRule,
  createRule,
  getSimpleRule,
  deleteAllRules,
  createExceptionList,
  createExceptionListItem,
  getThresholdRuleForAlertTesting,
  getSimpleRuleOutput,
  removeServerGeneratedProperties,
  downgradeImmutableRule,
  waitForRuleSuccess,
  installMockPrebuiltRules,
  waitForAlertsToBePresent,
  getAlertsByIds,
  findImmutableRuleById,
  getPrebuiltRulesAndTimelinesStatus,
  getOpenAlerts,
  createRuleWithExceptionEntries,
  getEqlRuleForAlertTesting,
  SAMPLE_PREBUILT_RULES,
  deleteAllAlerts,
  updateUsername,
} from '../../../utils';

import {
  createListsIndex,
  deleteAllExceptions,
  deleteListsIndex,
  importFile,
} from '../../../../lists_and_exception_lists/utils';
import {
  createUserAndRole,
  deleteUserAndRole,
} from '../../../../../../common/services/security_solution';
import { FtrProviderContext } from '../../../../../ftr_provider_context';

export default ({ getService }: FtrProviderContext) => {
  const supertest = getService('supertest');
  const supertestWithoutAuth = getService('supertestWithoutAuth');
  const esArchiver = getService('esArchiver');
  const log = getService('log');
  const es = getService('es');
  // TODO: add a new service
  const config = getService('config');
  const ELASTICSEARCH_USERNAME = config.get('servers.kibana.username');
  const isServerless = config.get('serverless');
  const dataPathBuilder = new EsArchivePathBuilder(isServerless);
  const path = dataPathBuilder.getPath('auditbeat/hosts');

  describe('@serverless @ess role_based_rule_exceptions_workflows', () => {
    before(async () => {
      await esArchiver.load(path);
    });

    after(async () => {
      await esArchiver.unload(path);
    });

    describe('creating rules with exceptions', () => {
      beforeEach(async () => {
        await createAlertsIndex(supertest, log);
      });

      afterEach(async () => {
        await deleteAllAlerts(supertest, log, es);
        await deleteAllRules(supertest, log);
        await deleteAllExceptions(supertest, log);
      });

      describe('elastic admin', () => {
        it('should create a single rule with a rule_id and add an exception list to the rule', async () => {
          const {
            body: { id, list_id, namespace_type, type },
          } = await supertest
            .post(EXCEPTION_LIST_URL)
            .set('kbn-xsrf', 'true')
            .send(getCreateExceptionListMinimalSchemaMock())
            .expect(200);

          const ruleWithException: RuleCreateProps = {
            ...getSimpleRule(),
            exceptions_list: [
              {
                id,
                list_id,
                namespace_type,
                type,
              },
            ],
          };
          const expectedRule = updateUsername(getSimpleRuleOutput(), ELASTICSEARCH_USERNAME);
          const rule = await createRule(supertest, log, ruleWithException);
          const expected = {
            ...expectedRule,
            exceptions_list: [
              {
                id,
                list_id,
                namespace_type,
                type,
              },
            ],
          };
          const bodyToCompare = removeServerGeneratedProperties(rule);
          expect(bodyToCompare).toEqual(expected);
        });

        it('should create a single rule with an exception list and validate it ran successfully', async () => {
          const {
            body: { id, list_id, namespace_type, type },
          } = await supertest
            .post(EXCEPTION_LIST_URL)
            .set('kbn-xsrf', 'true')
            .send(getCreateExceptionListMinimalSchemaMock())
            .expect(200);

          const ruleWithException: RuleCreateProps = {
            ...getSimpleRule(),
            enabled: true,
            exceptions_list: [
              {
                id,
                list_id,
                namespace_type,
                type,
              },
            ],
          };

          const rule = await createRule(supertest, log, ruleWithException);
          await waitForRuleSuccess({ supertest, log, id: rule.id });
          const bodyToCompare = removeServerGeneratedProperties(rule);
          const expectedRule = updateUsername(getSimpleRuleOutput(), ELASTICSEARCH_USERNAME);

          const expected = {
            ...expectedRule,
            enabled: true,
            exceptions_list: [
              {
                id,
                list_id,
                namespace_type,
                type,
              },
            ],
          };
          expect(bodyToCompare).toEqual(expected);
        });

        it('@skipInQA should allow removing an exception list from an immutable rule through patch', async () => {
          await installMockPrebuiltRules(supertest, es);

          // This rule has an existing exceptions_list that we are going to use
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one exceptions_list

          // remove the exceptions list as a user is allowed to remove it from an immutable rule
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({ rule_id: ELASTIC_SECURITY_RULE_ID, exceptions_list: [] })
            .expect(200);

          const immutableRuleSecondTime = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRuleSecondTime.exceptions_list.length).toEqual(0);
        });

        it('@skipInQA should allow adding a second exception list to an immutable rule through patch', async () => {
          await installMockPrebuiltRules(supertest, es);

          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          // This rule has an existing exceptions_list that we are going to use
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one

          // add a second exceptions list as a user is allowed to add a second list to an immutable rule
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ELASTIC_SECURITY_RULE_ID,
              exceptions_list: [
                ...immutableRule.exceptions_list,
                {
                  id,
                  list_id,
                  namespace_type,
                  type,
                },
              ],
            })
            .expect(200);

          const immutableRuleSecondTime = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });

          expect(immutableRuleSecondTime.exceptions_list.length).toEqual(2);
        });

        it('@skipInQA should override any updates to pre-packaged rules if the user removes the exception list through the API but the new version of a rule has an exception list again', async () => {
          await installMockPrebuiltRules(supertest, es);

          // This rule has an existing exceptions_list that we are going to use
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one

          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({ rule_id: ELASTIC_SECURITY_RULE_ID, exceptions_list: [] })
            .expect(200);

          await downgradeImmutableRule(es, log, ELASTIC_SECURITY_RULE_ID);
          await installMockPrebuiltRules(supertest, es);
          const immutableRuleSecondTime = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });

          // We should have a length of 1 and it should be the same as our original before we tried to remove it using patch
          expect(immutableRuleSecondTime.exceptions_list.length).toEqual(1);
          expect(immutableRuleSecondTime.exceptions_list).toEqual(immutableRule.exceptions_list);
        });

        it('@skipInQA should merge back an exceptions_list if it was removed from the immutable rule through PATCH', async () => {
          await installMockPrebuiltRules(supertest, es);

          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          // This rule has an existing exceptions_list that we are going to ensure does not stomp on our existing rule
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one

          // remove the exception list and only have a single list that is not an endpoint_list
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ELASTIC_SECURITY_RULE_ID,
              exceptions_list: [
                {
                  id,
                  list_id,
                  namespace_type,
                  type,
                },
              ],
            })
            .expect(200);

          await downgradeImmutableRule(es, log, ELASTIC_SECURITY_RULE_ID);
          await installMockPrebuiltRules(supertest, es);
          const immutableRuleSecondTime = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });

          expect(immutableRuleSecondTime.exceptions_list).toEqual([
            ...immutableRule.exceptions_list,
            {
              id,
              list_id,
              namespace_type,
              type,
            },
          ]);
        });

        it('@skipInQA should NOT add an extra exceptions_list that already exists on a rule during an upgrade', async () => {
          await installMockPrebuiltRules(supertest, es);

          // This rule has an existing exceptions_list that we are going to ensure does not stomp on our existing rule
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one

          await downgradeImmutableRule(es, log, ELASTIC_SECURITY_RULE_ID);
          await installMockPrebuiltRules(supertest, es);

          const immutableRuleSecondTime = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });

          // The installed rule should have both the original immutable exceptions list back and the
          // new list the user added.
          expect(immutableRuleSecondTime.exceptions_list).toEqual([
            ...immutableRule.exceptions_list,
          ]);
        });

        it('@skipInQA should NOT allow updates to pre-packaged rules to overwrite existing exception based rules when the user adds an additional exception list', async () => {
          await installMockPrebuiltRules(supertest, es);

          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          // This rule has an existing exceptions_list that we are going to ensure does not stomp on our existing rule
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });

          // add a second exceptions list as a user is allowed to add a second list to an immutable rule
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ELASTIC_SECURITY_RULE_ID,
              exceptions_list: [
                ...immutableRule.exceptions_list,
                {
                  id,
                  list_id,
                  namespace_type,
                  type,
                },
              ],
            })
            .expect(200);

          await downgradeImmutableRule(es, log, ELASTIC_SECURITY_RULE_ID);
          await installMockPrebuiltRules(supertest, es);
          const immutableRuleSecondTime = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });

          // It should be the same as what the user added originally
          expect(immutableRuleSecondTime.exceptions_list).toEqual([
            ...immutableRule.exceptions_list,
            {
              id,
              list_id,
              namespace_type,
              type,
            },
          ]);
        });

        it('@skipInQA should not remove any exceptions added to a pre-packaged/immutable rule during an update if that rule has no existing exception lists', async () => {
          await installMockPrebuiltRules(supertest, es);

          // Create a new exception list
          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          // Find a rule without exceptions_list
          const ruleWithoutExceptionList = SAMPLE_PREBUILT_RULES.find(
            (rule) => !rule['security-rule'].exceptions_list
          );
          const ruleId = ruleWithoutExceptionList?.['security-rule'].rule_id;
          if (!ruleId) {
            throw new Error('Cannot find a rule without exceptions_list in the sample data');
          }

          const immutableRule = await fetchRule(supertest, { ruleId });
          expect(immutableRule.exceptions_list.length).toEqual(0); // make sure we have no exceptions_list

          // add a second exceptions list as a user is allowed to add a second list to an immutable rule
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ruleId,
              exceptions_list: [
                {
                  id,
                  list_id,
                  namespace_type,
                  type,
                },
              ],
            })
            .expect(200);

          await downgradeImmutableRule(es, log, ruleId);
          await installMockPrebuiltRules(supertest, es);
          const immutableRuleSecondTime = await fetchRule(supertest, { ruleId });

          expect(immutableRuleSecondTime.exceptions_list).toEqual([
            {
              id,
              list_id,
              namespace_type,
              type,
            },
          ]);
        });

        it('@skipInQA should not change the immutable tags when adding a second exception list to an immutable rule through patch', async () => {
          await installMockPrebuiltRules(supertest, es);

          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          // This rule has an existing exceptions_list that we are going to use
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one

          // add a second exceptions list as a user is allowed to add a second list to an immutable rule
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ELASTIC_SECURITY_RULE_ID,
              exceptions_list: [
                ...immutableRule.exceptions_list,
                {
                  id,
                  list_id,
                  namespace_type,
                  type,
                },
              ],
            })
            .expect(200);

          const body = await findImmutableRuleById(supertest, log, ELASTIC_SECURITY_RULE_ID);
          expect(body.data.length).toEqual(1); // should have only one length to the data set, otherwise we have duplicates or the tags were removed and that is incredibly bad.

          const bodyToCompare = removeServerGeneratedProperties(body.data[0]);
          expect(bodyToCompare.rule_id).toEqual(immutableRule.rule_id); // Rule id should not change with a a patch
          expect(bodyToCompare.immutable).toEqual(immutableRule.immutable); // Immutable should always stay the same which is true and never flip to false.
          expect(bodyToCompare.version).toEqual(immutableRule.version); // The version should never update on a patch
        });

        it('@skipInQA should not change count of prepacked rules when adding a second exception list to an immutable rule through patch. If this fails, suspect the immutable tags are not staying on the rule correctly.', async () => {
          await installMockPrebuiltRules(supertest, es);

          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          // This rule has an existing exceptions_list that we are going to use
          const immutableRule = await fetchRule(supertest, {
            ruleId: ELASTIC_SECURITY_RULE_ID,
          });
          expect(immutableRule.exceptions_list.length).toBeGreaterThan(0); // make sure we have at least one

          // add a second exceptions list as a user is allowed to add a second list to an immutable rule
          await supertest
            .patch(DETECTION_ENGINE_RULES_URL)
            .set('kbn-xsrf', 'true')
            .set('elastic-api-version', '2023-10-31')
            .send({
              rule_id: ELASTIC_SECURITY_RULE_ID,
              exceptions_list: [
                ...immutableRule.exceptions_list,
                {
                  id,
                  list_id,
                  namespace_type,
                  type,
                },
              ],
            })
            .expect(200);

          const status = await getPrebuiltRulesAndTimelinesStatus(supertest);
          expect(status.rules_not_installed).toEqual(0);
        });
      });

      describe('@brokenInServerless t1_analyst', () => {
        const role = ROLES.t1_analyst;

        beforeEach(async () => {
          await createUserAndRole(getService, role);
        });

        afterEach(async () => {
          await deleteUserAndRole(getService, role);
        });

        it('should NOT be able to create an exception list', async () => {
          await supertestWithoutAuth
            .post(EXCEPTION_LIST_ITEM_URL)
            .auth(role, 'changeme')
            .set('kbn-xsrf', 'true')
            .send(getCreateExceptionListItemMinimalSchemaMock())
            .expect(403);
        });

        it('should NOT be able to create an exception list item', async () => {
          await supertestWithoutAuth
            .post(EXCEPTION_LIST_ITEM_URL)
            .auth(role, 'changeme')
            .set('kbn-xsrf', 'true')
            .send(getCreateExceptionListItemMinimalSchemaMock())
            .expect(403);
        });
      });

      // FLAKY: https://github.com/elastic/kibana/issues/169664
      describe.skip('tests with auditbeat data', () => {
        before(async () => {
          await esArchiver.load(path);
        });

        after(async () => {
          await esArchiver.unload(path);
        });

        beforeEach(async () => {
          await createAlertsIndex(supertest, log);
        });

        afterEach(async () => {
          await deleteAllAlerts(supertest, log, es);
          await deleteAllRules(supertest, log);
          await deleteAllExceptions(supertest, log);
        });

        it('should be able to execute against an exception list that does not include valid entries and get back 10 alerts', async () => {
          const { id, list_id, namespace_type, type } = await createExceptionList(
            supertest,
            log,
            getCreateExceptionListMinimalSchemaMock()
          );

          const exceptionListItem: CreateExceptionListItemSchema = {
            ...getCreateExceptionListItemMinimalSchemaMock(),
            entries: [
              {
                field: 'some.none.existent.field', // non-existent field where we should not exclude anything
                operator: 'included',
                type: 'match',
                value: 'some value',
              },
            ],
          };
          await createExceptionListItem(supertest, log, exceptionListItem);

          const ruleWithException: RuleCreateProps = {
            name: 'Simple Rule Query',
            description: 'Simple Rule Query',
            enabled: true,
            risk_score: 1,
            rule_id: 'rule-1',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'query',
            from: '1900-01-01T00:00:00.000Z',
            query: 'host.name: "suricata-sensor-amsterdam"',
            exceptions_list: [
              {
                id,
                list_id,
                namespace_type,
                type,
              },
            ],
          };
          const { id: createdId } = await createRule(supertest, log, ruleWithException);
          await waitForRuleSuccess({ supertest, log, id: createdId });
          await waitForAlertsToBePresent(supertest, log, 10, [createdId]);
          const alertsOpen = await getAlertsByIds(supertest, log, [createdId]);
          expect(alertsOpen.hits.hits.length).toEqual(10);
        });

        it('should be able to execute against an exception list that does include valid entries and get back 0 alerts', async () => {
          const rule: QueryRuleCreateProps = {
            name: 'Simple Rule Query',
            description: 'Simple Rule Query',
            enabled: true,
            risk_score: 1,
            rule_id: 'rule-1',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'query',
            from: '1900-01-01T00:00:00.000Z',
            query: 'host.name: "suricata-sensor-amsterdam"',
          };
          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.name', // This matches the query above which will exclude everything
                operator: 'included',
                type: 'match',
                value: 'suricata-sensor-amsterdam',
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits.length).toEqual(0);
        });

        it('should be able to execute against an exception list that does include valid case sensitive entries and get back 0 alerts', async () => {
          const rule: QueryRuleCreateProps = {
            name: 'Simple Rule Query',
            description: 'Simple Rule Query',
            enabled: true,
            risk_score: 1,
            rule_id: 'rule-1',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'query',
            from: '1900-01-01T00:00:00.000Z',
            query: 'host.name: "suricata-sensor-amsterdam"',
          };
          const rule2: QueryRuleCreateProps = {
            name: 'Simple Rule Query',
            description: 'Simple Rule Query',
            enabled: true,
            risk_score: 1,
            rule_id: 'rule-2',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'query',
            from: '1900-01-01T00:00:00.000Z',
            query: 'host.name: "suricata-sensor-amsterdam"',
          };
          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.os.name',
                operator: 'included',
                type: 'match_any',
                value: ['ubuntu'],
              },
            ],
          ]);
          const createdRule2 = await createRuleWithExceptionEntries(supertest, log, rule2, [
            [
              {
                field: 'host.os.name', // This matches the query above which will exclude everything
                operator: 'included',
                type: 'match_any',
                value: ['ubuntu', 'Ubuntu'],
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          const alertsOpen2 = await getOpenAlerts(supertest, log, es, createdRule2);
          // Expect alerts here because all values are "Ubuntu"
          // and exception is one of ["ubuntu"]
          expect(alertsOpen.hits.hits.length).toEqual(10);
          // Expect no alerts here because all values are "Ubuntu"
          // and exception is one of ["ubuntu", "Ubuntu"]
          expect(alertsOpen2.hits.hits.length).toEqual(0);
        });

        it('generates no alerts when an exception is added for an EQL rule', async () => {
          const rule: EqlRuleCreateProps = {
            ...getEqlRuleForAlertTesting(['auditbeat-*']),
            query: 'configuration where agent.id=="a1d7b39c-f898-4dbe-a761-efb61939302d"',
          };
          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.id',
                operator: 'included',
                type: 'match',
                value: '8cc95778cce5407c809480e8e32ad76b',
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits.length).toEqual(0);
        });

        it('generates no alerts when an exception is added for a threshold rule', async () => {
          const rule: ThresholdRuleCreateProps = {
            ...getThresholdRuleForAlertTesting(['auditbeat-*']),
            threshold: {
              field: 'host.id',
              value: 700,
            },
          };
          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'host.id',
                operator: 'included',
                type: 'match',
                value: '8cc95778cce5407c809480e8e32ad76b',
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits.length).toEqual(0);
        });

        it('generates no alerts when an exception is added for a threat match rule', async () => {
          const rule: ThreatMatchRuleCreateProps = {
            description: 'Detecting root and admin users',
            name: 'Query with a rule id',
            severity: 'high',
            index: ['auditbeat-*'],
            type: 'threat_match',
            risk_score: 55,
            language: 'kuery',
            rule_id: 'rule-1',
            from: '1900-01-01T00:00:00.000Z',
            query: '*:*',
            threat_query: 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
            threat_index: ['auditbeat-*'], // We use auditbeat as both the matching index and the threat list for simplicity
            threat_mapping: [
              // We match host.name against host.name
              {
                entries: [
                  {
                    field: 'host.name',
                    value: 'host.name',
                    type: 'mapping',
                  },
                ],
              },
            ],
            threat_filters: [],
          };

          const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
            [
              {
                field: 'source.ip',
                operator: 'included',
                type: 'match',
                value: '188.166.120.93',
              },
            ],
          ]);
          const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
          expect(alertsOpen.hits.hits.length).toEqual(0);
        });
        describe('rules with value list exceptions', () => {
          beforeEach(async () => {
            await createListsIndex(supertest, log);
          });

          afterEach(async () => {
            await deleteListsIndex(supertest, log);
          });

          it('generates no alerts when a value list exception is added for a query rule', async () => {
            const valueListId = 'value-list-id';
            await importFile(supertest, log, 'keyword', ['suricata-sensor-amsterdam'], valueListId);
            const rule: QueryRuleCreateProps = {
              name: 'Simple Rule Query',
              description: 'Simple Rule Query',
              enabled: true,
              risk_score: 1,
              rule_id: 'rule-1',
              severity: 'high',
              index: ['auditbeat-*'],
              type: 'query',
              from: '1900-01-01T00:00:00.000Z',
              query: 'host.name: "suricata-sensor-amsterdam"',
            };
            const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
              [
                {
                  field: 'host.name',
                  operator: 'included',
                  type: 'list',
                  list: {
                    id: valueListId,
                    type: 'keyword',
                  },
                },
              ],
            ]);
            const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
            expect(alertsOpen.hits.hits.length).toEqual(0);
          });

          it('generates no alerts when a value list exception is added for a threat match rule', async () => {
            const valueListId = 'value-list-id';
            await importFile(supertest, log, 'keyword', ['zeek-sensor-amsterdam'], valueListId);
            const rule: ThreatMatchRuleCreateProps = {
              description: 'Detecting root and admin users',
              name: 'Query with a rule id',
              severity: 'high',
              index: ['auditbeat-*'],
              type: 'threat_match',
              risk_score: 55,
              language: 'kuery',
              rule_id: 'rule-1',
              from: '1900-01-01T00:00:00.000Z',
              query: '*:*',
              threat_query: 'source.ip: "188.166.120.93"', // narrow things down with a query to a specific source ip
              threat_index: ['auditbeat-*'], // We use auditbeat as both the matching index and the threat list for simplicity
              threat_mapping: [
                // We match host.name against host.name
                {
                  entries: [
                    {
                      field: 'host.name',
                      value: 'host.name',
                      type: 'mapping',
                    },
                  ],
                },
              ],
              threat_filters: [],
            };

            const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
              [
                {
                  field: 'host.name',
                  operator: 'included',
                  type: 'list',
                  list: {
                    id: valueListId,
                    type: 'keyword',
                  },
                },
              ],
            ]);
            const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
            expect(alertsOpen.hits.hits.length).toEqual(0);
          });

          it('generates no alerts when a value list exception is added for a threshold rule', async () => {
            const valueListId = 'value-list-id';
            await importFile(supertest, log, 'keyword', ['zeek-sensor-amsterdam'], valueListId);
            const rule: ThresholdRuleCreateProps = {
              description: 'Detecting root and admin users',
              name: 'Query with a rule id',
              severity: 'high',
              index: ['auditbeat-*'],
              type: 'threshold',
              risk_score: 55,
              language: 'kuery',
              rule_id: 'rule-1',
              from: '1900-01-01T00:00:00.000Z',
              query: 'host.name: "zeek-sensor-amsterdam"',
              threshold: {
                field: 'host.name',
                value: 1,
              },
            };

            const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
              [
                {
                  field: 'host.name',
                  operator: 'included',
                  type: 'list',
                  list: {
                    id: valueListId,
                    type: 'keyword',
                  },
                },
              ],
            ]);
            const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
            expect(alertsOpen.hits.hits.length).toEqual(0);
          });

          it('generates no alerts when a value list exception is added for an EQL rule', async () => {
            const valueListId = 'value-list-id';
            await importFile(supertest, log, 'keyword', ['zeek-sensor-amsterdam'], valueListId);
            const rule: EqlRuleCreateProps = {
              ...getEqlRuleForAlertTesting(['auditbeat-*']),
              query: 'configuration where host.name=="zeek-sensor-amsterdam"',
            };

            const createdRule = await createRuleWithExceptionEntries(supertest, log, rule, [
              [
                {
                  field: 'host.name',
                  operator: 'included',
                  type: 'list',
                  list: {
                    id: valueListId,
                    type: 'keyword',
                  },
                },
              ],
            ]);
            const alertsOpen = await getOpenAlerts(supertest, log, es, createdRule);
            expect(alertsOpen.hits.hits.length).toEqual(0);
          });
          it('should Not allow deleting value list when there are references and ignoreReferences is false', async () => {
            const valueListId = 'value-list-id';
            await importFile(supertest, log, 'keyword', ['suricata-sensor-amsterdam'], valueListId);
            const rule: QueryRuleCreateProps = {
              ...getSimpleRule(),
              query: 'host.name: "suricata-sensor-amsterdam"',
            };
            await createRuleWithExceptionEntries(supertest, log, rule, [
              [
                {
                  field: 'host.name',
                  operator: 'included',
                  type: 'list',
                  list: {
                    id: valueListId,
                    type: 'keyword',
                  },
                },
              ],
            ]);

            const deleteReferences = false;
            const ignoreReferences = false;

            // Delete the value list
            await supertest
              .delete(
                `${LIST_URL}?deleteReferences=${deleteReferences}&id=${valueListId}&ignoreReferences=${ignoreReferences}`
              )
              .set('kbn-xsrf', 'true')
              .send()
              .expect(409);
          });
        });
      });
    });
  });
};
