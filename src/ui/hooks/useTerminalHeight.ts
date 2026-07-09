import { useState, useEffect } from 'react';

export function useTerminalHeight(): number {
  const [height, setHeight] = useState<number>(process.stdout.rows);

  useEffect(() => {
    const onResize = (): void => {
      setHeight(process.stdout.rows);
    };
    process.stdout.on('resize', onResize);
    return (): void => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return height;
}
