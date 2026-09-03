import React from 'react';

interface SunhouseLogoProps {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * High-definition Vector SVG Logo for SUNHOUSE
 * Accurately matches the corporate brand identity:
 * - Characteristic teal background with rounded top & arched bottom
 * - Centered bold red capsule pill
 * - Pure white uppercase SUNHOUSE typography with registered trademark symbol
 */
export const SunhouseLogo: React.FC<SunhouseLogoProps> = ({
  width = 40,
  height = 22,
  className = '',
  style,
}) => {
  return (
    <svg
      viewBox="0 0 200 110"
      width={width}
      height={height}
      className={className}
      style={{
        display: 'inline-block',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Teal background block - top half with rounded corners */}
      <path
        d="M 38 10 C 38 4 44 0 52 0 L 148 0 C 156 0 162 4 162 10 L 162 44 L 38 44 Z"
        fill="#007788"
      />
      {/* Teal background block - bottom half with concave curved arch */}
      <path
        d="M 38 66 L 162 66 L 162 100 C 162 106 156 110 148 110 C 122 104 78 104 52 110 C 44 110 38 106 38 100 Z"
        fill="#007788"
      />
      {/* Red capsule pill spanning across */}
      <rect x="2" y="24" width="196" height="62" rx="31" fill="#e11b22" />
      {/* White SUNHOUSE text */}
      <text
        x="98"
        y="67"
        fill="#ffffff"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Arial Black', Impact, sans-serif"
        fontWeight="900"
        fontSize="35"
        textAnchor="middle"
        letterSpacing="-0.5px"
      >
        SUNHOUSE
      </text>
      {/* Registered trademark symbol R */}
      <text
        x="182"
        y="44"
        fill="#ffffff"
        fontFamily="Arial, sans-serif"
        fontWeight="bold"
        fontSize="12"
      >
        ®
      </text>
    </svg>
  );
};
