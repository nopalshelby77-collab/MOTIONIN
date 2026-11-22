export const SAMPLE_VECTOR_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="640" height="640">
  <rect id="Backdrop Frame" x="40" y="40" width="560" height="560" rx="88" fill="#131926" stroke="#2D3A54" stroke-width="4" />
  <circle id="Orbit Ring" cx="320" cy="276" r="168" fill="none" stroke="#3B82F6" stroke-width="10" opacity="0.85" />
  <polygon id="Hex Crest" points="320,124 452,200 452,352 320,428 188,352 188,200" fill="#1E293B" stroke="#60A5FA" stroke-width="5" />
  <path id="Wing Left" d="M214 294 L298 176 L312 246 L252 328 Z" fill="#3B82F6" />
  <path id="Wing Right" d="M426 294 L342 176 L328 246 L388 328 Z" fill="#60A5FA" />
  <path id="Core Diamond" d="M320 228 L356 276 L320 326 L284 276 Z" fill="#F8FAFC" />
  <circle id="Center Node" cx="320" cy="276" r="16" fill="#2563EB" />
  <rect id="Accent Bar" x="210" y="458" width="220" height="8" rx="4" fill="#3B82F6" opacity="0.9" />
  <text id="Wordmark" x="196" y="516" font-family="Plus Jakarta Sans" font-size="42" font-weight="700" fill="#F8FAFC">VECTOR AM</text>
</svg>`;

export const SAMPLE_ALIGHT_MOTION_XML = `<?xml version="1.0" encoding="utf-8"?>
<scene title="Kinetic Crest AM" width="1080" height="1080" exportWidth="1080" exportHeight="1080" fps="60" totalTime="5000" bgcolor="#ff0d1118" amver="4020000">
  <shape id="am_bg_plate" label="Base Plate" startTime="0" endTime="5000" s=".roundrect" fillType="color" hidden="false" locked="false">
    <transform>
      <location value="540.00,540.00,0.00" />
      <pivot value="0.00,0.00" />
      <rotation value="0.00" />
      <scale value="1.00,1.00" />
      <opacity value="1.000" />
    </transform>
    <property name="size" type="vec2" value="760.00,760.00" />
    <fillColor value="#ff172030" />
    <stroke color="#ff2a3954" size="6.00" />
  </shape>
  <shape id="am_outer_ring" label="Outer Circle" startTime="0" endTime="5000" s=".circle" fillType="none" hidden="false" locked="false">
    <transform>
      <location value="540.00,480.00,0.00" />
      <pivot value="0.00,0.00" />
      <rotation value="0.00" />
      <scale value="1.00,1.00" />
      <opacity value="0.900" />
    </transform>
    <property name="size" type="vec2" value="440.00,440.00" />
    <fillColor value="#00000000" />
    <stroke color="#ff3b82f6" size="16.00" />
  </shape>
  <embedScene id="am_emblem_grp" label="Emblem Group" startTime="0" endTime="5000" hidden="false" locked="false">
    <transform>
      <location value="540.00,480.00,0.00" />
      <pivot value="0.00,0.00" />
      <rotation value="0.00" />
      <scale value="1.00,1.00" />
      <opacity value="1.000" />
    </transform>
    <scene title="Emblem Group" width="320" height="320" fps="60" totalTime="5000" bgcolor="#00000000">
      <shape id="am_blade_l" label="Left Blade" startTime="0" endTime="5000" s=".custom" fillType="color" hidden="false" locked="false">
        <transform>
          <location value="105.00,160.00,0.00" />
          <pivot value="0.00,0.00" />
          <rotation value="0.00" />
          <scale value="1.00,1.00" />
          <opacity value="1.000" />
        </transform>
        <property name="size" type="vec2" value="130.00,240.00" />
        <property name="path" type="path" value="M-65 30 L35 -120 L65 -40 L-15 120 Z" />
        <fillColor value="#ff3b82f6" />
      </shape>
      <shape id="am_blade_r" label="Right Blade" startTime="0" endTime="5000" s=".custom" fillType="color" hidden="false" locked="false">
        <transform>
          <location value="215.00,160.00,0.00" />
          <pivot value="0.00,0.00" />
          <rotation value="0.00" />
          <scale value="1.00,1.00" />
          <opacity value="1.000" />
        </transform>
        <property name="size" type="vec2" value="130.00,240.00" />
        <property name="path" type="path" value="M65 30 L-35 -120 L-65 -40 L15 120 Z" />
        <fillColor value="#ff93c5fd" />
      </shape>
    </scene>
  </embedScene>
  <shape id="am_core_star" label="Core Star" startTime="0" endTime="5000" s=".star" fillType="color" hidden="false" locked="false">
    <transform>
      <location value="540.00,480.00,0.00" />
      <pivot value="0.00,0.00" />
      <rotation value="0.00" />
      <scale value="1.00,1.00" />
      <opacity value="1.000" />
    </transform>
    <property name="size" type="vec2" value="96.00,96.00" />
    <fillColor value="#fff8fafc" />
  </shape>
  <text id="am_title_txt" label="Title Text" startTime="0" endTime="5000" size="64.00" font="Plus Jakarta Sans" align="center" hidden="false" locked="false">
    <content>KINETIC STUDIO</content>
    <transform>
      <location value="540.00,805.00,0.00" />
      <pivot value="0.00,0.00" />
      <rotation value="0.00" />
      <scale value="1.00,1.00" />
      <opacity value="1.000" />
    </transform>
    <fillColor value="#fff8fafc" />
  </text>
</scene>`;
