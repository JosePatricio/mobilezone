import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ActionsMenu } from './ActionsMenu';

describe('ActionsMenu', () => {
  it('shows the actions in a dropdown and closes after choosing one', async () => {
    const edit = vi.fn();
    const remove = vi.fn();
    render(
      <ActionsMenu
        label="Acciones de Cargador"
        actions={[
          { label: 'Editar', onClick: edit },
          { label: 'Eliminar', onClick: remove, danger: true },
        ]}
      />,
    );
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Acciones de Cargador' }));
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Editar', 'Eliminar']);
    expect(screen.getByRole('menuitem', { name: 'Eliminar' })).toHaveClass('text-danger');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar' }));
    expect(edit).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes with Escape and when clicking outside', async () => {
    render(<ActionsMenu actions={[{ label: 'Stock', onClick: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'Acciones' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders nothing without actions', () => {
    const { container } = render(<ActionsMenu actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
