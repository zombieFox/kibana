/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const AGENT_FIELD = '[data-test-subj="comboBoxInput"]';
export const ALL_AGENTS_OPTION = '[title="All agents"]';
export const LIVE_QUERY_EDITOR = 'kibanaCodeEditor';
export const OSQUERY_FLYOUT_BODY_EDITOR =
  '[data-test-subj="flyout-body-osquery"] .kibanaCodeEditor';
export const SUBMIT_BUTTON = '#submit-button';

export const RESULTS_TABLE = 'osqueryResultsTable';
export const RESULTS_TABLE_BUTTON = 'dataGridFullScreenButton';
export const RESULTS_TABLE_CELL_WRRAPER = 'EuiDataGridHeaderCellWrapper';

export const getIdFormField = () => cy.get('input[name="id"]');
