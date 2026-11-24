export const SF_SYMBOLS: Record<string, string> = {
  faceid:
    '<path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/>' +
    '<path d="M8.5 9v1.5M15.5 9v1.5M12 9v4.2h-1"/><path d="M9 16c.8.7 1.8 1 3 1s2.2-.3 3-1"/>',
  'lock.fill':
    '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  creditcard: '<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6 15h4"/>',
  'creditcard.fill':
    '<rect x="2.5" y="5" width="19" height="14" rx="3" fill="currentColor" stroke="none"/><path d="M2.5 9.5h19" stroke="var(--sf-cut, #fff)" stroke-width="2.4"/>',
  'wallet.pass':
    '<rect x="4.5" y="2.5" width="15" height="19" rx="3"/><path d="M4.5 8.5h15"/><path d="M9 14h6M9 17h4"/>',
  'wallet.pass.fill':
    '<rect x="4.5" y="2.5" width="15" height="19" rx="3" fill="currentColor" stroke="none"/><path d="M4.5 8.5h15M9 14h6M9 17h4" stroke="var(--sf-cut, #fff)"/>',
  'clock.arrow.circlepath':
    '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>',
  'clock.fill':
    '<circle cx="12" cy="12" r="9.5"/><path d="M12 7v5l3.2 2"/>',
  checkmark: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  'checkmark.circle.fill':
    '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M7.5 12.4l3 3 6-6.4" stroke="#fff" stroke-width="2.2"/>',
  'checkmark.seal.fill':
    '<path d="M12 2.5l2.3 1.6 2.8-.2.9 2.7 2.3 1.6-.9 2.7.9 2.7-2.3 1.6-.9 2.7-2.8-.2L12 21.5l-2.3-1.6-2.8.2-.9-2.7-2.3-1.6.9-2.7-.9-2.7 2.3-1.6.9-2.7 2.8.2z" fill="currentColor" stroke="none"/>' +
    '<path d="M8.5 12.2l2.4 2.4 4.6-5" stroke="#fff" stroke-width="2"/>',
  xmark: '<path d="M7 7l10 10M17 7L7 17"/>',
  'building.columns':
    '<path d="M3 9.5L12 4l9 5.5z"/><path d="M5.5 11v7M10 11v7M14 11v7M18.5 11v7M3 20.5h18"/>',
  banknote: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>',
  'circle.lefthalf.filled':
    '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" stroke="none"/>',
  'chevron.right': '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
  ticket:
    '<path d="M4 5.5h16a1 1 0 0 1 1 1v3a2.5 2.5 0 0 0 0 5v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2.5 2.5 0 0 0 0-5v-3a1 1 0 0 1 1-1z"/><path d="M14.5 6v12" stroke-dasharray="1.6 2.2"/>',
  bag: '<path d="M5 8h14l-1.1 12.5H6.1z"/><path d="M9 10.5V7a3 3 0 0 1 6 0v3.5"/>',
  'shield.checkered':
    '<path d="M12 2.8l7.5 2.9v5.9c0 4.6-3.2 8.4-7.5 9.6-4.3-1.2-7.5-5-7.5-9.6V5.7z"/><path d="M8.7 12l2.3 2.3 4.4-4.8"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  'lock.open':
    '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>',
  storefront:
    '<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5L4.6 4h14.8L21 9.5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M10 20v-5h4v5"/>',
  'person.crop.circle':
    '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="10" r="3.2"/><path d="M6.3 18.2c1.3-2 3.4-3 5.7-3s4.4 1 5.7 3"/>',
  'person.2.fill':
    '<circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 18.5c1-2.5 3-3.8 5.5-3.8s4.5 1.3 5.5 3.8"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M15 18.5c.6-1.8 2-2.8 4-2.8 1 0 1.8.3 2.5.9"/>',
  qrcode:
    '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM17 17h3.5v3.5H17zM14 20h2M20 14v2"/>',
  'qrcode.viewfinder':
    '<path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/>' +
    '<rect x="7" y="7" width="4" height="4" rx="0.8"/><rect x="13" y="7" width="4" height="4" rx="0.8"/><rect x="7" y="13" width="4" height="4" rx="0.8"/><path d="M13 13h4v4h-4z"/>',
  'camera.fill':
    '<path d="M4 7.5h3l1.6-2h6.8l1.6 2h3A1.5 1.5 0 0 1 21.5 9v9A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z"/><circle cx="12" cy="13.2" r="3.5"/>',
  'camera.viewfinder':
    '<path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/><circle cx="12" cy="12" r="3.5"/>',
  wifi:
    '<path d="M2.5 9.5a14.5 14.5 0 0 1 19 0M5.8 13a10 10 0 0 1 12.4 0M9.2 16.4a5.2 5.2 0 0 1 5.6 0"/><circle cx="12" cy="19.5" r="1.2" fill="currentColor"/>',
  'gearshape.fill':
    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.2 2.1 2.3.5 1.9-1.3 1.8 1.8-1.3 1.9.5 2.3 2.1 1.2v2.5l-2.1 1.2-.5 2.3 1.3 1.9-1.8 1.8-1.9-1.3-2.3.5-1.2 2.1H9.5l-1.2-2.1-2.3-.5-1.9 1.3-1.8-1.8 1.3-1.9-.5-2.3-2.1-1.2v-2.5l2.1-1.2.5-2.3-1.3-1.9 1.8-1.8 1.9 1.3 2.3-.5 1.2-2.1z"/>',
  'exclamationmark.triangle.fill':
    '<path d="M10.4 4.2L2.9 17.5A1.8 1.8 0 0 0 4.5 20h15a1.8 1.8 0 0 0 1.6-2.5L13.6 4.2a1.8 1.8 0 0 0-3.2 0z"/><path d="M12 9v4.5"/><circle cx="12" cy="16.8" r="1" fill="currentColor"/>'
};
