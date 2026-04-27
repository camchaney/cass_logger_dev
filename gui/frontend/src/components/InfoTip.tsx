export default function InfoTip({ text }: { text: string }) {
	return (
		<span className="info-tip">
			ⓘ
			<span className="tip-content">{text}</span>
		</span>
	)
}
