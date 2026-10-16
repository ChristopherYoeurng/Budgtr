/**
 * Smoke test: the app renders and shows all four primary tabs.
 *
 * RNTL v14: render() is async and must be awaited; queries go through `screen`.
 *
 * @format
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders all four primary tab labels', async () => {
    await render(<App />);

    // The active screen's title duplicates its tab label, so "Accounts"
    // appears twice (header + tab). The other three appear once (tab only).
    expect(screen.getAllByText('Accounts').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Transactions')).toBeOnTheScreen();
    expect(screen.getByText('Budgets')).toBeOnTheScreen();
    expect(screen.getByText('Insights')).toBeOnTheScreen();
  });

  it('shows the Accounts empty state by default', async () => {
    await render(<App />);
    expect(screen.getByTestId('accounts-empty')).toBeOnTheScreen();
  });
});
