RaiselyComponents => {
	const LOOKUP_PROXY =
		"https://us-central1-raisely-custom.cloudfunctions.net/blm-lookup";

	const Embed = RaiselyComponents.import('blm-embed');

	const { Link, Spinner } = RaiselyComponents;
	const { Button } = RaiselyComponents.Atoms;
	const { Modal, RaiselyShare } = RaiselyComponents.Molecules;
	const { get } = RaiselyComponents.Common;

	const some = obj => {
		return obj[Math.floor(Math.random() * obj.length)];
	};

	const Illustrations = () => (
		<div className="illys">
			<img className="illys__illy illys__illy--left" src="https://raisely-images.imgix.net/raisely-blm/uploads/illy-left-png-c5f7db.png" />
			<img className="illys__illy illys__illy--right" src="https://raisely-images.imgix.net/raisely-blm/uploads/illy-right-png-4dbfb9.png" />
		</div>
	)

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
				<i className="material-icons">expand_more</i>
			</div>
		);
	};

	const OrganisationLogo = ({ org }) => {
		let logo = org.logo;
		let hasIlly = false;

		if (
			!logo
			|| logo === '(none)'
			|| logo.includes('.ico')
			|| logo.includes('favicon')
		) {
			// pick random illustration
			logo = some(['https://raisely-images.imgix.net/raisely-blm/uploads/figure-three-png-e57031.png', 'https://raisely-images.imgix.net/raisely-blm/uploads/figure-two-png-3ef7bb.png', 'https://raisely-images.imgix.net/raisely-blm/uploads/figure-four-png-ef30a9.png', 'https://raisely-images.imgix.net/raisely-blm/uploads/figure-one-png-72ca16.png']);
			hasIlly = true;
		}

		return (
			<div className={`organisation-logo ${hasIlly ? 'organisation-logo--has-illy' : ''}`}>
				<span
					className="organisation-logo__img organisation-logo__img--invert"
					style={{ backgroundImage: `url(${logo})` }}
				/>
				<span
					className="organisation-logo__img organisation-logo__img--color"
					style={{ backgroundImage: `url(${logo})` }}
					title={`${org.title}'s logo`}
				/>
			</div>
		);
	};

	const HighlightOrganisation = ({ org, setHighlight, data, sources, countryList, country, global }) => {
		if (!org || !org.donateUrl) return null;

		const [showEmbed, setShowEmbed] = React.useState();

		const ShareModal = ({ automatic }) => (
			<Modal
				button
				automatic={automatic}
				buttonTitle="Share"
				onClose={() => setShowEmbed(false)}
				modalContent={() => (
					<div className="share-modal">
						<h2>📣&nbsp;Spread the word</h2>
						<RaiselyShare
							theme="filled"
							size="normal"
							networks={['facebook', 'twitter', 'email', 'whatsapp', 'linkedin', 'link']}
							global={global}
						/>
						<Embed
							url={org.donateUrl}
							name={org.title}
						/>
					</div>
				)}
			/>
		)

		return (
			<React.Fragment>
				<a
					className="highlight-org"
					href={org.donateUrl}
					rel="noopener"
					target="_blank"
				>
					<div className="highlight-org__edge">
						<span />
						<span />
						<span />
						<span />
					</div>
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
					<ShareModal />
					{showEmbed && <ShareModal automatic />}
					<span className="highlight-actions__divider">-</span>
					<a href="#list">Or choose from the list 👇</a>
					<span className="separator" />
				</div>
				<div className="about-section" id="list">
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
								country={country}
							/>
						)}
					/>
				</div>
			</React.Fragment>
		);
	};

	const About = ({ sources, countryList, country }) => {
		const mergedSources = {};
		sources.forEach(source => {
			if (!mergedSources[source.country]) mergedSources[source.country] = [];
			mergedSources[source.country].push(source.url);
		});

		return (
			<div className="about__wrapper">
				<p>
					This is a compilation of community resources to make them easier for people to access and support #BLM
					in their country.
				</p>
				<p>
					The information in this website is compiled automatically from the community created spreadsheets listed below.
				</p>
				<div className="source-list">
					<h4>Sources</h4>
					<ul>
						{Object.keys(mergedSources).map(countryCode => (
							<React.Fragment>
								<li>
									<strong>
										{get(countryList[countryCode.toUpperCase()], 'name', countryCode.toUpperCase())}
									</strong>
									{' - '}
									{mergedSources[countryCode].map((source, i) => (
										<React.Fragment>
											<Link
												href={source}
												target="_blank"
												rel="noopener"
											>
												Source {i + 1}
											</Link>
											{((i + 1) < mergedSources[countryCode].length) ? ', ' : ''}
										</React.Fragment>
									))}
								</li>
								<span className="separator" />
							</React.Fragment>
						))}
					</ul>
				</div>
				<ContactUs email="support@raisely.com" country={country} />
			</div>
		);
	};

	const ListOrgansinations = ({ data }) => {
		return (
			<section className="organisations">
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

	const ContactUs = ({ country, email }) => {
		const subject = `Add an Organisation | YouHaveOur.Support`;
		const body = `
			I want to add this organisation to your list of resources:

			Organisation Name:
			Country: ${country && country}
			Description (3 sentences or less):
			Donation Page URL:
			Logo: Please attach your logo to this message. Recommended image dimensions are 400px x 400px (the size of your Twitter profile image), and the image should be 2MB or smaller. 
		`;

		const parseString = (str) => encodeURIComponent(str.trim().replace(/\t/g, '')).replace(/%3A/g, ':')

		const message = `mailto:${email}?subject=${parseString(subject)}&body=${parseString(body)}`;

		return (
			<section className="contact-us">
				<h4>Don't see your organisation listed?</h4>
				<a className="button button--primary" href={message}>
					Add your Organisation
				</a>
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
		}, [detected]);

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
				<Illustrations />
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
						global={global}
						country={detectedCountry}
					/>
					<ListOrgansinations data={countryData} />
					{data && <ContactUs country={detectedCountry} email="support@raisely.com" />}
				</div>
			</section>
		);
	};
};
