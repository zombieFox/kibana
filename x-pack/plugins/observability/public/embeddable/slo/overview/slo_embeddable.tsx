/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import ReactDOM from 'react-dom';
import { i18n } from '@kbn/i18n';

import {
  Embeddable as AbstractEmbeddable,
  EmbeddableOutput,
  IContainer,
} from '@kbn/embeddable-plugin/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type CoreStart, IUiSettingsClient, ApplicationStart } from '@kbn/core/public';
import { Subject } from 'rxjs';
import { SloOverview } from './slo_overview';
import type { SloEmbeddableInput } from './types';

export const SLO_EMBEDDABLE = 'SLO_EMBEDDABLE';

interface SloEmbeddableDeps {
  uiSettings: IUiSettingsClient;
  http: CoreStart['http'];
  i18n: CoreStart['i18n'];
  application: ApplicationStart;
}

export class SLOEmbeddable extends AbstractEmbeddable<SloEmbeddableInput, EmbeddableOutput> {
  public readonly type = SLO_EMBEDDABLE;
  private node?: HTMLElement;
  private reloadSubject: Subject<boolean>;

  constructor(
    private readonly deps: SloEmbeddableDeps,
    initialInput: SloEmbeddableInput,
    parent?: IContainer
  ) {
    super(initialInput, {}, parent);
    this.reloadSubject = new Subject<boolean>();

    this.setTitle(
      this.input.title ||
        i18n.translate('xpack.observability.sloEmbeddable.displayTitle', {
          defaultMessage: 'SLO Overview',
        })
    );
  }

  setTitle(title: string) {
    this.updateInput({ title });
  }

  public onRenderComplete() {
    this.renderComplete.dispatchComplete();
  }

  public render(node: HTMLElement) {
    super.render(node);
    this.node = node;
    // required for the export feature to work
    this.node.setAttribute('data-shared-item', '');

    const { sloId, sloInstanceId } = this.getInput();
    const queryClient = new QueryClient();

    const I18nContext = this.deps.i18n.Context;
    ReactDOM.render(
      <I18nContext>
        <KibanaContextProvider services={this.deps}>
          <QueryClientProvider client={queryClient}>
            <SloOverview
              onRenderComplete={() => this.onRenderComplete()}
              sloId={sloId}
              sloInstanceId={sloInstanceId}
              reloadSubject={this.reloadSubject}
            />
          </QueryClientProvider>
        </KibanaContextProvider>
      </I18nContext>,
      node
    );
  }

  public reload() {
    this.reloadSubject.next(true);
  }

  public destroy() {
    super.destroy();
    if (this.node) {
      ReactDOM.unmountComponentAtNode(this.node);
    }
  }
}
