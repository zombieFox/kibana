/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { chartPluginMock } from '@kbn/charts-plugin/public/mocks';

import { paths } from '../../../common/locators/paths';
import { historicalSummaryData } from '../../data/slo/historical_summary_data';
import { emptySloList, sloList } from '../../data/slo/slo';
import { useCapabilities } from '../../hooks/slo/use_capabilities';
import { useCreateSlo } from '../../hooks/slo/use_create_slo';
import { useDeleteSlo } from '../../hooks/slo/use_delete_slo';
import { useFetchHistoricalSummary } from '../../hooks/slo/use_fetch_historical_summary';
import { useFetchSloList } from '../../hooks/slo/use_fetch_slo_list';
import { useLicense } from '../../hooks/use_license';
import { useKibana } from '../../utils/kibana_react';
import { render } from '../../utils/test_helper';
import { SlosPage } from './slos';
import { encode } from '@kbn/rison';

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}));

jest.mock('@kbn/observability-shared-plugin/public');
jest.mock('../../utils/kibana_react');
jest.mock('../../hooks/use_license');
jest.mock('../../hooks/slo/use_fetch_slo_list');
jest.mock('../../hooks/slo/use_create_slo');
jest.mock('../../hooks/slo/use_delete_slo');
jest.mock('../../hooks/slo/use_fetch_historical_summary');
jest.mock('../../hooks/slo/use_capabilities');

const useKibanaMock = useKibana as jest.Mock;
const useLicenseMock = useLicense as jest.Mock;
const useFetchSloListMock = useFetchSloList as jest.Mock;
const useCreateSloMock = useCreateSlo as jest.Mock;
const useDeleteSloMock = useDeleteSlo as jest.Mock;
const useFetchHistoricalSummaryMock = useFetchHistoricalSummary as jest.Mock;
const useCapabilitiesMock = useCapabilities as jest.Mock;

const mockCreateSlo = jest.fn();
const mockDeleteSlo = jest.fn();

useCreateSloMock.mockReturnValue({ mutate: mockCreateSlo });
useDeleteSloMock.mockReturnValue({ mutate: mockDeleteSlo });

const mockNavigate = jest.fn();
const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();
const mockLocator = jest.fn();
const mockGetAddRuleFlyout = jest.fn().mockReturnValue(() => <div>Add rule flyout</div>);

const mockKibana = () => {
  useKibanaMock.mockReturnValue({
    services: {
      theme: {},
      application: { navigateToUrl: mockNavigate },
      charts: chartPluginMock.createSetupContract(),
      data: {
        dataViews: {
          find: jest.fn().mockReturnValue([]),
          get: jest.fn().mockReturnValue([]),
        },
      },
      dataViews: {
        create: jest.fn().mockResolvedValue(42),
      },
      docLinks: {
        links: {
          query: {},
        },
      },
      http: {
        basePath: {
          prepend: (url: string) => url,
        },
      },
      notifications: {
        toasts: {
          addSuccess: mockAddSuccess,
          addError: mockAddError,
        },
      },
      observabilityAIAssistant: observabilityAIAssistantPluginMock.createStartContract(),
      share: {
        url: {
          locators: {
            get: mockLocator,
          },
        },
      },
      storage: {
        get: () => {},
      },
      triggersActionsUi: { getAddRuleFlyout: mockGetAddRuleFlyout },
      uiSettings: {
        get: (settings: string) => {
          if (settings === 'dateFormat') return 'YYYY-MM-DD';
          if (settings === 'format:percent:defaultPattern') return '0.0%';
          return '';
        },
      },
      unifiedSearch: {
        autocomplete: {
          hasQuerySuggestions: () => {},
        },
      },
    },
  });
};

describe('SLOs Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKibana();
    useCapabilitiesMock.mockReturnValue({ hasWriteCapabilities: true, hasReadCapabilities: true });
  });

  describe('when the incorrect license is found', () => {
    beforeEach(() => {
      useFetchSloListMock.mockReturnValue({ isLoading: false, sloList: emptySloList });
      useLicenseMock.mockReturnValue({ hasAtLeast: () => false });
      useFetchHistoricalSummaryMock.mockReturnValue({
        isLoading: false,
        data: {},
      });
    });
    it('navigates to the SLOs Welcome Page', async () => {
      await act(async () => {
        render(<SlosPage />);
      });

      await waitFor(() => {
        expect(mockNavigate).toBeCalledWith(paths.observability.slosWelcome);
      });
    });
  });

  describe('when the correct license is found', () => {
    beforeEach(() => {
      useLicenseMock.mockReturnValue({ hasAtLeast: () => true });
    });

    it('navigates to the SLOs Welcome Page when the API has finished loading and there are no results', async () => {
      useFetchSloListMock.mockReturnValue({ isLoading: false, data: emptySloList });
      useFetchHistoricalSummaryMock.mockReturnValue({
        isLoading: false,
        data: {},
      });

      await act(async () => {
        render(<SlosPage />);
      });

      await waitFor(() => {
        expect(mockNavigate).toBeCalledWith(paths.observability.slosWelcome);
      });
    });

    it('should have a create new SLO button', async () => {
      useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

      useFetchHistoricalSummaryMock.mockReturnValue({
        isLoading: false,
        data: historicalSummaryData,
      });

      await act(async () => {
        render(<SlosPage />);
      });

      expect(screen.getByText('Create new SLO')).toBeTruthy();
    });

    it('should have an Auto Refresh button', async () => {
      useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

      useFetchHistoricalSummaryMock.mockReturnValue({
        isLoading: false,
        data: historicalSummaryData,
      });

      await act(async () => {
        render(<SlosPage />);
      });

      expect(screen.getByTestId('autoRefreshButton')).toBeTruthy();
    });

    describe('when API has returned results', () => {
      it('renders the SLO list with SLO items', async () => {
        useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

        useFetchHistoricalSummaryMock.mockReturnValue({
          isLoading: false,
          data: historicalSummaryData,
        });

        await act(async () => {
          render(<SlosPage />);
        });
        expect(await screen.findByTestId('sloListViewButton')).toBeTruthy();

        fireEvent.click(screen.getByTestId('sloListViewButton'));

        expect(screen.queryByTestId('slosPage')).toBeTruthy();
        expect(screen.queryByTestId('sloList')).toBeTruthy();
        expect(screen.queryAllByTestId('sloItem')).toBeTruthy();
        expect(screen.queryAllByTestId('sloItem').length).toBe(sloList.results.length);
      });

      it('allows editing an SLO', async () => {
        useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

        useFetchHistoricalSummaryMock.mockReturnValue({
          isLoading: false,
          data: historicalSummaryData,
        });

        await act(async () => {
          render(<SlosPage />);
        });
        expect(await screen.findByTestId('sloListViewButton')).toBeTruthy();
        fireEvent.click(screen.getByTestId('sloListViewButton'));

        screen.getAllByLabelText('All actions').at(0)?.click();

        await waitForEuiPopoverOpen();

        const button = screen.getByTestId('sloActionsEdit');

        expect(button).toBeTruthy();

        button.click();

        expect(mockNavigate).toBeCalledWith(
          `${paths.observability.sloEdit(sloList.results.at(0)?.id || '')}`
        );
      });

      it('allows creating a new rule for an SLO', async () => {
        useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

        useFetchHistoricalSummaryMock.mockReturnValue({
          isLoading: false,
          data: historicalSummaryData,
        });

        await act(async () => {
          render(<SlosPage />);
        });
        expect(await screen.findByTestId('sloListViewButton')).toBeTruthy();
        fireEvent.click(screen.getByTestId('sloListViewButton'));
        screen.getAllByLabelText('All actions').at(0)?.click();

        await waitForEuiPopoverOpen();

        const button = screen.getByTestId('sloActionsCreateRule');

        expect(button).toBeTruthy();

        button.click();

        expect(mockGetAddRuleFlyout).toBeCalled();
      });

      it('allows managing rules for an SLO', async () => {
        useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

        useFetchHistoricalSummaryMock.mockReturnValue({
          isLoading: false,
          data: historicalSummaryData,
        });

        await act(async () => {
          render(<SlosPage />);
        });
        expect(await screen.findByTestId('sloListViewButton')).toBeTruthy();
        fireEvent.click(screen.getByTestId('sloListViewButton'));
        screen.getAllByLabelText('All actions').at(0)?.click();

        await waitForEuiPopoverOpen();

        const button = screen.getByTestId('sloActionsManageRules');

        expect(button).toBeTruthy();

        button.click();

        expect(mockLocator).toBeCalled();
      });

      it('allows deleting an SLO', async () => {
        useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

        useFetchHistoricalSummaryMock.mockReturnValue({
          isLoading: false,
          data: historicalSummaryData,
        });

        await act(async () => {
          render(<SlosPage />);
        });

        expect(await screen.findByTestId('sloListViewButton')).toBeTruthy();
        fireEvent.click(screen.getByTestId('sloListViewButton'));
        screen.getAllByLabelText('All actions').at(0)?.click();

        await waitForEuiPopoverOpen();

        const button = screen.getByTestId('sloActionsDelete');

        expect(button).toBeTruthy();

        button.click();

        screen.getByTestId('confirmModalConfirmButton').click();

        expect(mockDeleteSlo).toBeCalledWith({
          id: sloList.results.at(0)?.id,
          name: sloList.results.at(0)?.name,
        });
      });

      it('allows cloning an SLO', async () => {
        useFetchSloListMock.mockReturnValue({ isLoading: false, data: sloList });

        useFetchHistoricalSummaryMock.mockReturnValue({
          isLoading: false,
          data: historicalSummaryData,
        });

        await act(async () => {
          render(<SlosPage />);
        });

        expect(await screen.findByTestId('sloListViewButton')).toBeTruthy();
        fireEvent.click(screen.getByTestId('sloListViewButton'));
        screen.getAllByLabelText('All actions').at(0)?.click();

        await waitForEuiPopoverOpen();

        const button = screen.getByTestId('sloActionsClone');

        expect(button).toBeTruthy();

        button.click();

        await waitFor(() => {
          const slo = sloList.results.at(0);
          expect(mockNavigate).toBeCalledWith(
            paths.observability.sloCreateWithEncodedForm(
              encode({ ...slo, name: `[Copy] ${slo!.name}`, id: undefined })
            )
          );
        });
      });
    });
  });
});
