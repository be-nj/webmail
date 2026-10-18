import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SubAddressHelper } from '../sub-address-helper';

// The sub-address popover's second tab: any address on a domain whose
// catch-all reaches the account (fork issue #1).

const open = () => fireEvent.click(screen.getByTitle('button_tooltip'));

describe('SubAddressHelper catch-all tab', () => {
  it('is not offered without catch-all domains', () => {
    render(<SubAddressHelper baseEmail="b@benj.de" recipientEmails={[]} onSelectTag={vi.fn()} onSelectAddress={vi.fn()} />);
    open();
    expect(screen.queryByRole('tab')).toBeNull();
  });

  it('builds the address from a local part and the chosen domain', () => {
    const onSelectAddress = vi.fn();
    render(
      <SubAddressHelper
        baseEmail="b@benj.de"
        recipientEmails={[]}
        onSelectTag={vi.fn()}
        catchAllDomains={['benj.email', 'bmn.email']}
        onSelectAddress={onSelectAddress}
      />,
    );
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'tab_catch_all' }));

    fireEvent.change(screen.getByLabelText('local_part_placeholder'), { target: { value: 'Firma' } });
    fireEvent.change(screen.getByLabelText('domain_label'), { target: { value: 'bmn.email' } });
    expect(screen.getByText('Firma@bmn.email')).toBeInTheDocument();

    fireEvent.click(screen.getByText('use_address'));
    expect(onSelectAddress).toHaveBeenCalledWith('firma@bmn.email');
  });

  it('splits a pasted full address and refuses an invalid local part', () => {
    const onSelectAddress = vi.fn();
    render(
      <SubAddressHelper
        baseEmail="b@benj.de"
        recipientEmails={[]}
        onSelectTag={vi.fn()}
        catchAllDomains={['benj.email', 'bmn.email']}
        onSelectAddress={onSelectAddress}
      />,
    );
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'tab_catch_all' }));
    const input = screen.getByLabelText('local_part_placeholder');

    fireEvent.change(input, { target: { value: 'shop@bmn.email' } });
    expect(input).toHaveValue('shop');
    expect(screen.getByLabelText('domain_label')).toHaveValue('bmn.email');

    fireEvent.change(input, { target: { value: 'sh op' } });
    expect(screen.getByText('validation.local_part_invalid')).toBeInTheDocument();
    expect(screen.getByText('use_address').closest('button')).toBeDisabled();
  });

  it('offers recently used addresses in one click', () => {
    const onSelectAddress = vi.fn();
    render(
      <SubAddressHelper
        baseEmail="b@benj.de"
        recipientEmails={[]}
        onSelectTag={vi.fn()}
        catchAllDomains={['benj.email']}
        recentCatchAllAddresses={['firma@benj.email']}
        onSelectAddress={onSelectAddress}
      />,
    );
    open();
    fireEvent.click(screen.getByRole('tab', { name: 'tab_catch_all' }));
    fireEvent.click(screen.getByText('firma@benj.email'));
    expect(onSelectAddress).toHaveBeenCalledWith('firma@benj.email');
  });
});
