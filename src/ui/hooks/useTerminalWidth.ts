import { useState, useEffect } from 'react';

export function useTerminalWidth(): number {
  const [width, setWidth] = useState<number>(process.stdout.columns);

  useEffect(() => {
    const onResize = (): void => {
      setWidth(process.stdout.columns);
    };
    process.stdout.on('resize', onResize);
    return (): void => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return width;
}
