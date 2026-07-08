import { useState, useEffect } from 'react';

export function useTerminalHeight(): number {
  const [height, setHeight] = useState<number>(process.stdout.rows ?? 24);

  useEffect(() => {
    const onResize = (): void => {
      setHeight(process.stdout.rows ?? 24);
    };
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return height;
}
