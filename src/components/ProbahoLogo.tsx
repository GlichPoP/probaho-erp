import React from 'react';

export interface ProbahoLogoProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  glow?: boolean;
}

/**
 * Official Brand Identity Logo for PROBAHO ERP.
 * Features an emerald & teal squircle with the luminous flowing ribbon monogram 'P',
 * representing continuous supply chain velocity, offline stability, and enterprise reliability.
 */
export const ProbahoLogo: React.FC<ProbahoLogoProps> = ({
  size = 32,
  className = '',
  style = {},
  glow = false
}) => {
  const gradBg = 'probaho-erp-bg-grad';
  const gradAccent = 'probaho-erp-accent-grad';
  const gradGlass = 'probaho-erp-glass-grad';

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        position: 'relative',
        ...style
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          filter: glow ? 'drop-shadow(0 4px 12px rgba(16, 185, 129, 0.4))' : 'none',
          transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <defs>
          {/* Base Enterprise Emerald & Forest Teal Gradient */}
          <linearGradient id={gradBg} x1="10" y1="10" x2="90" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#059669" />
            <stop offset="50%" stopColor="#0D9488" />
            <stop offset="100%" stopColor="#047857" />
          </linearGradient>

          {/* Flow Stream Accent Gradient (Luminous Mint to Aqua Cyan) */}
          <linearGradient id={gradAccent} x1="20" y1="20" x2="85" y2="85" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2DD4BF" />
            <stop offset="45%" stopColor="#34D399" />
            <stop offset="100%" stopColor="#6EE7B7" />
          </linearGradient>

          {/* Glass Specular Highlight */}
          <linearGradient id={gradGlass} x1="25" y1="15" x2="75" y2="60" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          {/* Drop Shadow Filter */}
          <filter id="probaho-logo-shadow" x="-10%" y="-10%" width="130%" height="130%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#064E3B" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Squircle Base */}
        <rect x="4" y="4" width="92" height="92" rx="26" fill={`url(#${gradBg})`} />
        <rect
          x="5"
          y="5"
          width="90"
          height="90"
          rx="25"
          stroke={`url(#${gradGlass})`}
          strokeWidth="1.5"
          fill="none"
          opacity="0.65"
        />
        <path d="M20 78C32 84 68 84 80 72" stroke="rgba(255, 255, 255, 0.18)" strokeWidth="3" strokeLinecap="round" />

        {/* Monogram P Ribbon */}
        <g filter="url(#probaho-logo-shadow)">
          <path
            d="M30 24C30 21.79 31.79 20 34 20H40C42.21 20 44 21.79 44 24V74C44 76.21 42.21 78 40 78H34C31.79 78 30 76.21 30 74V24Z"
            fill="#FFFFFF"
            fillOpacity="0.96"
          />
          <path
            d="M40 20H55C68.8 20 80 30.5 80 43.5C80 56.5 68.8 67 55 67H42"
            stroke={`url(#${gradAccent})`}
            strokeWidth="11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M42 22H55C66.5 22 76 31.5 76 43.5C76 55.5 66.5 65 55 65H42"
            stroke="#FFFFFF"
            strokeWidth="4.5"
            strokeLinecap="round"
          />
          <circle cx="55" cy="43.5" r="5" fill="#2DD4BF" />
          <circle cx="55" cy="43.5" r="2" fill="#FFFFFF" />
        </g>
      </svg>
    </div>
  );
};
export default ProbahoLogo;
