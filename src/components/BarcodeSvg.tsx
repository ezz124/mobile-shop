import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeSvgProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  className?: string;
}

export default function BarcodeSvg({
  value,
  width = 1.4,
  height = 36,
  displayValue = true,
  fontSize = 11,
  className = '',
}: BarcodeSvgProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width,
        height,
        displayValue,
        fontSize,
        font: 'monospace',
        margin: 2,
        textMargin: 2,
      });
    } catch (err) {
      console.warn('JsBarcode preview render warning:', err);
    }
  }, [value, width, height, displayValue, fontSize]);

  if (!value) {
    return <div className="text-xs text-ink-mute italic">لا يوجد باركود</div>;
  }

  return <svg ref={svgRef} className={`block max-w-full h-auto mx-auto ${className}`} />;
}
