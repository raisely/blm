(RaiselyComponents, React) => {
	const { getQuery } = RaiselyComponents.api;
	const { get } = RaiselyComponents.Common;

	return function BlmEmbed(props) {
		const { name, url, getValues } = props;
		const [content, setContent] = React.useState();
		const [hasCopied, setHasCopied] = React.useState();

		const values = (getValues && typeof getValues === 'function') && getValues();
		const query = get(props, 'router.location.search') && getQuery(get(props, 'router.location.search'));
		const style = `background: black; color: white; padding: 1rem; width: 100%;`;

		const charityName = name || query.name || values.name || 'support #BLM';
		const charityUrl = url || query.url || values.url || 'https://raisely-blm.raisely.com/';

		const defaultHtml = `<div style="${style}">
	<p style="font-size: 1rem; text-align: left;">✊🏿✊🏾✊🏽 We know that our mission can only be achieved when people are safe from violence against their community.
	<br/>You can support equal rights for all by donating to <a style="color: white; text-decoration: underline;" href="${charityUrl}">${charityName}</a></p>
</div>`;

		const exampleHtml = content || defaultHtml;

		const copy = async () => {
			await navigator.clipboard.writeText(exampleHtml);
			setHasCopied(true);
		}

		return (
			<div className="embed__wrapper">
				<textarea className="embed__code" onChange={e => setContent(e.target.value)} value={exampleHtml} />
				<button onClick={copy}>{hasCopied ? 'Copied!' : 'Copy HTML'}</button>
				<div className="embed__example" dangerouslySetInnerHTML={{ __html: exampleHtml }} />
			</div>
		);
	};
}
