/** Food illustration (Microsoft Fluent Emoji 3D, MIT) */
export default function FoodIcon({ image, size = 40 }: { image: string; size?: number }) {
  return (
    <img
      src={`/foods/${image}.webp`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 select-none"
      draggable={false}
    />
  );
}
