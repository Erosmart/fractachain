export default function CrystalBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white" aria-hidden>
      <div className="absolute -left-24 -top-28 h-[28rem] w-[28rem] rounded-full bg-[#cfe8c4] opacity-70 blur-[90px]" />
      <div className="absolute right-[-8rem] top-24 h-[32rem] w-[32rem] rounded-full bg-[#d9f0cf] opacity-80 blur-[110px]" />
      <div className="absolute bottom-[-10rem] left-1/4 h-[26rem] w-[26rem] rounded-full bg-[#b7d9a8] opacity-50 blur-[100px]" />
      <div className="absolute right-1/3 top-1/2 h-64 w-64 rounded-full bg-[#eaf6e4] opacity-90 blur-[70px]" />
      <div className="liquid-sheen absolute inset-0 opacity-40" />
    </div>
  );
}
