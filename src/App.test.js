import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the app heading and scan call-to-action', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { level: 1, name: /duplicate finder/i })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /scan my photos/i })
  ).toBeInTheDocument();
});
