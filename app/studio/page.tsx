'use client';

import dynamic from 'next/dynamic';
const Studio = dynamic(()=>import('@/components/studio/Studio'),{ssr:false,loading:()=> <main style={{padding:32}}>Loading robot theme studio…</main>});
export default function StudioPage() {return <Studio />;}
