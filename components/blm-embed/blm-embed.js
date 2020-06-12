(RaiselyComponents, React) => {
	const { getQuery } = RaiselyComponents.api;
	const { get } = RaiselyComponents.Common;
	const { Button } = RaiselyComponents.Atoms;

	return function BlmEmbed(props) {
		const { name, url, getValues } = props;
		const [content, setContent] = React.useState('We know that our mission can only be achieved when people are safe from violence against their community.');
		const [embedCode, setEmbedCode] = React.useState();
		const [hasCopied, setHasCopied] = React.useState();

		const values = (getValues && typeof getValues === 'function') && getValues();
		const query = get(props, 'router.location.search') && getQuery(get(props, 'router.location.search'));

		const styleBg = 'background: black;';
		const styleText = 'color: white;';
		const style = `${styleBg} ${styleText} padding: 1.25rem; width: 100%; box-sizing: border-box;`;

		const charityName = name || query.name || values.name || 'support #BLM';
		const charityUrl = url || query.url || values.url || 'https://raisely-blm.raisely.com/';
		const image = `<img src="https://raisely-images.imgix.net/raisely-crm/uploads/fists-png-f77a8c.png?w=70" style="margin: 0; margin-right: .25em; vertical-align: middle; width: 70px;" />`;

		const getEmbedCode = () => (
			`<div style="${style}">
				<p style="font-size: 1rem; text-align: left; margin-top: 0; margin-bottom: .5em; ${styleText}">${image}${content}</p>
				<p style="font-size: 1rem; text-align: left; margin-top: 0; margin-bottom: 0; ${styleText}">You can support equal rights for all by donating to <a style="${styleText} text-decoration: underline; font-weight: bold;" target="_blank" rel="noopener" href="${charityUrl}">${charityName}</a>.</p>
			</div>`
		)

		const copy = async () => {
			await navigator.clipboard.writeText(embedCode);
			setHasCopied(true);

			setTimeout(() => {
				setHasCopied(false);
			}, 2000);
		}

		React.useEffect(() => {

			setEmbedCode(getEmbedCode(content))
		}, [content]);

		return (
			<div className="embed__wrapper">
				<h4>Embed Code</h4>
				<div className="embed__text">
					<h6>Text</h6>
					<textarea className="embed__text-input" onChange={e => setContent(e.target.value)} value={content} rows="2" />
				</div>
				{/* <p className="embed__text__help">Change this text to customise the embed.</p> */}
				{/* <textarea className="embed__code" onChange={e => setEmbedCode(e.target.value)} value={embedCode} /> */}
				<div className="embed__content">
					<div className="embed__content__header">
						<h6>Example</h6>
						<Button onClick={() => copy()}>{hasCopied ? 'Copied!' : 'Copy Embed'}</Button>
					</div>
					<div
						className="embed__example"
						dangerouslySetInnerHTML={{ __html: embedCode }}
					/>
				</div>
			</div>
		);
	};
}
