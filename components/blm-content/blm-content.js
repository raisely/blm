RaiselyComponents => {
	const LOOKUP_PROXY =
		"https://us-central1-raisely-custom.cloudfunctions.net/blm-lookup";

	const Embed = RaiselyComponents.import('blm-embed');

	const { Link, Spinner } = RaiselyComponents;
	const { Button } = RaiselyComponents.Atoms;
	const { Modal } = RaiselyComponents.Molecules;
	const { get } = RaiselyComponents.Common;

	const some = obj => {
		return obj[Math.floor(Math.random() * obj.length)];
	};

	const CountrySelector = ({ countries, current, handleChange }) => {
		return (
			<div className="country-select">
				<select
					value={current.code}
					onChange={e => handleChange(e.target.value)}
				>
					{Object.values(countries).map(({ code: country, flag }) => (
						<option value={country.toUpperCase()}>
							{country.toUpperCase()}
						</option>
					))}
					{/* <option value="rest">GLOBAL</option> */}
				</select>
				{current.rest ? "🌍" : current.flag}
			</div>
		);
	};

	const OrganisationLogo = ({ org }) => {
		if (
			!org.logo
			|| org.logo === '(none)'
			|| org.logo.includes('.ico')
			|| org.logo.includes('favicon')
		) return null;

		return (
			<div className="organisation-logo">
				<span
					className="organisation-logo__img organisation-logo__img--invert"
					style={{ backgroundImage: `url(${org.logo})` }}
				/>
				<span
					className="organisation-logo__img organisation-logo__img--color"
					style={{ backgroundImage: `url(${org.logo})` }}
					title={`${org.title}'s logo`}
				/>
			</div>
		);
	};

	const HighlightOrganisation = ({ org, setHighlight, data, sources, countryList }) => {
		if (!org || !org.donateUrl) return null;

		const [showEmbed, setShowEmbed] = React.useState();

		return (
			<React.Fragment>
				<a
					className="highlight-org"
					href={org.donateUrl}
					rel="noopener"
					target="_blank"
				>
					<div className="highlight-org__content">
						<OrganisationLogo org={org} />
						<div className="highlight-org__content-description">
							<h6>{org.title}</h6>
							<p>{org.description}</p>
						</div>
					</div>
					<div className="highlight-org__footer">
						<Button
							theme="cta"
							onClick={() => setShowEmbed(true)}
						>
							<span className="thin">Donate to&nbsp;</span>
							{org.title}
						</Button>
						<p className="small">The struggle will continue after this moment passes. Consider making a regular donation.</p>
					</div>
				</a>
				<div className="highlight-actions">
					<button
						className="link-button"
						onClick={() => data &&
							setHighlight(
								some(
									// ensure same org can be chosen twice in a row
									data.filter(
										cause => cause.title !== org.title
									)
								)
							)
						}
					>
						<i className="material-icons loop">loop</i>
						Show me another
					</button>
					<span className="highlight-actions__divider">-</span>
					{/* <button
						className="link-button"
						href={`/link?name=${org.title}&url=${org.donateUrl}`}
					>
						<i className="material-icons">code</i>
						Embed
					</button> */}
					<Modal
						button
						buttonTitle="Embed"
						onClose={() => setShowEmbed(false)}
						modalContent={() => (
							<Embed
								url={org.donateUrl}
								name={org.title}
							/>
						)}
					/>
					{showEmbed && <Modal
						button
						automatic
						buttonTitle="Embed"
						onClose={() => setShowEmbed(false)}
						modalContent={() => (
							<Embed
								url={org.donateUrl}
								name={org.title}
							/>
						)}
					/>}
					<span className="highlight-actions__divider">-</span>
					<a href="#list">Or choose from the list 👇</a>
				</div>
				<div className="about-section">
					<i className="material-icons">error_outline</i>
					<p className="small">
						The information has been compiled automatically from community sources. It has not been vetted.
						You should verify any organisation or person yourself before making a donation.
					</p>
					<Modal
						button
						buttonTitle="More"
						modalContent={() => (
							<About
								sources={sources}
								countryList={countryList}
							/>
						)}
					/>
				</div>
			</React.Fragment>
		);
	};

	const About = ({ sources, countryList }) => {
		const mergedSources = {};
		sources.forEach(source => {
			if (!mergedSources[source.country]) mergedSources[source.country] = [];
			mergedSources[source.country].push(source.url);
		});
		console.log(mergedSources, countryList)
		return (
			<div className="about__wrapper">
				<p>
					This is a compilation of community resources to make them easier for people to access and support #BLM
					in their country.
				</p>
				<p>
					The information in this website is compiled automatically from the community created spreadsheets listed below.
				</p>
				<p>
					Feel free to{' '}
					<Link href="https://github.com/raisely/blm">contact us</Link>{' '}
					to share resources that should be added, or corrections that need to be made.
				</p>
				<div className="source-list">
					<h3>Sources</h3>
					<ul>
						{Object.keys(mergedSources).map(countryCode => (
							<li>
								<strong>
									{get(countryList[countryCode.toUpperCase()], 'name', countryCode.toUpperCase())}
								</strong>
								{' - '}
								{mergedSources[countryCode].map((source, i) => (
									<React.Fragment>
										<Link href={source}>Source {i + 1}</Link>
										{((i + 1) < mergedSources[countryCode].length) ? ',' : ''}
									</React.Fragment>
								))}

							</li>
						))}
					</ul>
				</div>
			</div>
		);
	};

	const ListOrgansinations = ({ data }) => {
		return (
			<section className="organisations" id="list">
				{data &&
					data.map(org => (
						<a
							className="organisation"
							href={org.donateUrl}
							rel="noopener"
							target="_blank"
						>
							<OrganisationLogo org={org} />
							<div className="organisation__content">
								<h4>{org.title}</h4>
								{org.description && <p>{org.description}</p>}
							</div>
							<div className="organisation__donate">
								<Button
									href={org.donateUrl}
									rel="noopener"
									target="_blank"
								>
									Donate
								</Button>
							</div>
						</a>
					))}
			</section>
		);
	};

	return props => {
		const { global, editor } = props;
		const values = props.getValues();
		const { countries, defaultTitle, defaultSheet } = values;
		const { countries: countryList, detectedCountry: detected } = global;

		const [detectedCountry, setDetectedCountry] = React.useState();
		const [countryData, setCountryData] = React.useState();
		const [highlight, setHighlight] = React.useState();
		const [data, setData] = React.useState();
		const [sources, setSources] = React.useState();

		const nearbyCountries = {
			'AU': ['NZ'],
			'US': ['CA'],
			'UK': ['IE', 'IM']
		};

		const dummyData = {
			AU: [
				{
					title: "Aboriginal Legal Service",
					logo:
						"https://d3n8a8pro7vhmx.cloudfront.net/alsnswact/sites/2/meta_images/original/site-logo.png?1553758710",
					description: "Legal services in NSW and the ACT",
					donateUrl: "https://www.alsnswact.org.au/donate"
				},
				{
					title: "ALRM",
					logo:
						"https://www.alrm.org.au/wp-content/uploads/2018/05/newlogo_small.jpg",
					description: "Legal Services SA",
					donateUrl: "https://www.alrm.org.au/donate/"
				},
				{
					title: "ALS WA",
					logo:
						"https://www.als.org.au/wp-content/uploads/2018/02/ALSWA-Logo-SM.jpg",
					description: "Legal Services WA",
					donateUrl: "https://www.als.org.au/donations-bequests/"
				},
				{
					title: "Pay the Rent",
					logo:
						"https://paytherent.net.au/wp-content/uploads/2020/01/Logo_circle_final-e1579760881379.png",
					description:
						"We live, work and play on land that was forcibly taken from Aboriginal people.  There has been no Treaty with the First Nations of this place and the effects of colonisation continue to this day.",
					donateUrl: "https://paytherent.net.au/"
				}
			],
			US: [
				{
					title: "US Based Org",
					logo: null,
					description:
						"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Qui convenit? Itaque hic ipse iam pridem est reiectus; Quicquid enim a sapientia proficiscitur, id continuo debet expletum esse omnibus suis partibus; Tibi hoc incredibile, quod beatissimum. Duo Reges: constructio interrete.",
					donateUrl: "#"
				},
				{
					title: "US Based Charity",
					logo:
						"https://www.alrm.org.au/wp-content/uploads/2018/05/newlogo_small.jpg",
					description:
						"Quae quidem sapientes sequuntur duce natura tamquam videntes; Duo Reges: constructio interrete.",
					donateUrl: "#"
				}
			],
			rest: [
				{
					title: "Other Org",
					logo: null,
					description:
						"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Qui convenit? Itaque hic ipse iam pridem est reiectus; Quicquid enim a sapientia proficiscitur, id continuo debet expletum esse omnibus suis partibus; Tibi hoc incredibile, quod beatissimum. Duo Reges: constructio interrete.",
					donateUrl: "#"
				},
				{
					title: "Other Charity",
					logo: null,
					description:
						"Quae quidem sapientes sequuntur duce natura tamquam videntes; Duo Reges: constructio interrete.",
					donateUrl: "#"
				}
			]
		};

		async function loadCharities() {
			try {
				const response = await fetch(LOOKUP_PROXY);
				if (!response.ok) {
					console.error(await response.text());
				}
				const body = await response.json();
				const { data, sources } = body;
				setData(data);
				setSources(sources);
			} catch (e) {
				console.error(e);
			}
		}

		// get current country field object
		const current = (countries &&
			detectedCountry &&
			countries.find(c => c.code.toUpperCase() === detectedCountry)) || {
			rest: true,
			title: defaultTitle,
			sheet: defaultSheet
		};

		React.useEffect(() => {
			if (editor) {
				setDetectedCountry("AU");
			} else {
				let nearestCountry = detected;
				if (!countries.find(c => c.code === detected)) {
					nearestCountry = Object.keys(nearbyCountries).find(key =>
						nearbyCountries[key].includes(detected)
					);
				}
				setDetectedCountry(nearestCountry);
			}
		}, []);

		React.useEffect(() => {
			if (!editor) {
				loadCharities();
			}
		}, []);

		React.useEffect(() => {
			if (editor) {
				setCountryData(dummyData[detectedCountry] || dummyData.rest);
			} else {
				if (data) setCountryData(data[detectedCountry] || data.AU);
			}
		}, [detectedCountry, data]);

		React.useEffect(() => {
			// set highlighted cause using current country else randomly select from data
			if (current && countryData)
				setHighlight(
					(current.highlight &&
						countryData.find(
							cause =>
								cause.title.toLowerCase() ===
								current.highlight.toLowerCase()
						)) ||
					some(countryData)
				);
		}, [countryData]);

		return (
			<section className="content">
				{current && (
					<h1 className="title">
						<div className="title__before">
							<span>✊🏿</span>
							<span>✊🏾</span>
							<span>✊🏽</span>
						</div>
						<CountrySelector
							countries={countries}
							current={current}
							handleChange={setDetectedCountry}
						/>
						{current.title}
					</h1>
				)}
				<div className="content__container">
					{!data && <Spinner size={2} />}
					<HighlightOrganisation
						org={highlight}
						setHighlight={setHighlight}
						data={countryData}
						sources={sources}
						countryList={countryList}
					/>
					<ListOrgansinations data={countryData} />
				</div>
			</section>
		);
	};
};
