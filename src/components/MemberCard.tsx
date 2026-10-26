import { QRCodeSVG } from 'qrcode.react';
import memberCardFront from '../assets/member-card-front.jpg';
import memberCardBack from '../assets/member-card-back.jpg';

// Coordinates below are hand-measured against the source assets (front:
// 1200×702, back: 1200×687, cropped from the user's own "kartu depan.png" /
// "kartu belakang.png" exports) so the overlays land on the blank "NAMA" /
// "ID MEMBER" lines and inside the QR bracket frame printed in the design.
// SVG viewBox scaling keeps everything — image, text, QR — proportional
// at any render size, from a 56px dashboard thumbnail up to a print page.

export function MemberCardFront({
  name,
  memberCode,
  phone,
}: {
  name: string;
  memberCode: string;
  phone?: string | null;
}) {
  return (
    <svg viewBox="0 0 1200 702" className="w-full rounded-2xl shadow-lg" xmlns="http://www.w3.org/2000/svg">
      <image href={memberCardFront} x={0} y={0} width={1200} height={702} preserveAspectRatio="xMidYMid slice" />
      <text x={92} y={408} fontSize={34} fontWeight={700} fill="#efe7d6" fontFamily="system-ui, sans-serif">
        {name.toUpperCase()}
      </text>
      <text x={89} y={538} fontSize={26} letterSpacing={2} fill="#cfc9bd" fontFamily="ui-monospace, monospace">
        {memberCode}
      </text>
      <text x={89} y={570} fontSize={15} letterSpacing={3} fill="#a7a195" fontFamily="system-ui, sans-serif">
        NO HP
      </text>
      <text x={89} y={600} fontSize={22} letterSpacing={1} fill="#cfc9bd" fontFamily="ui-monospace, monospace">
        {phone || '-'}
      </text>
    </svg>
  );
}

export function MemberCardBack({ memberCode }: { memberCode: string }) {
  return (
    <svg viewBox="0 0 1200 687" className="w-full rounded-2xl shadow-lg" xmlns="http://www.w3.org/2000/svg">
      <image href={memberCardBack} x={0} y={0} width={1200} height={687} preserveAspectRatio="xMidYMid slice" />
      <rect x={405} y={102} width={380} height={380} rx={10} fill="#efe7d6" />
      <svg x={415} y={112} width={360} height={360}>
        <QRCodeSVG value={memberCode} size={360} level="M" bgColor="#efe7d6" fgColor="#163f24" />
      </svg>
    </svg>
  );
}

export default function MemberCard({
  name,
  memberCode,
  phone,
  side,
}: {
  name: string;
  memberCode: string;
  phone?: string | null;
  side: 'front' | 'back';
}) {
  return side === 'front' ? (
    <MemberCardFront name={name} memberCode={memberCode} phone={phone} />
  ) : (
    <MemberCardBack memberCode={memberCode} />
  );
}
