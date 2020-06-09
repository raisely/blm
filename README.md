# YouHaveOur.Support ✊🏿✊🏾✊🏽

Did you come here to report an issue with the site, an update that's needed or a resource that should be added/fixed?

👉🏾 [Click here](https://github.com/raisely/blm/issues/new) 👈🏾

This app compiles #BLM resources focusing on organisations you can donate to to support #BLM in your country.

The information at [YouHaveOur.Support](https://YouHaveOur.Support) is compiled automatically from 
community created spreadsheets in order to make the information more accessible to those who wish to support.

### How it works

YouHaveOur.Support is hosted on [Raisely.com](https://raisely.com), using [custom react components](components)
supported by a [cloud function](functions) to compile the information.

The cloud function compiles links from a list of community sources and attempts to scrape a logo or twitter avatar
for the link.

The compiled information is cached into a [master spreadsheet](https://docs.google.com/spreadsheets/d/1BrzORduZ4Zf4y0HlHbkOnZqT826fHCjI_c4k4y0AaMo/edit#gid=854958934) that can be used to correct logos or descriptions
or hide an entry if need be.

### License

This software is licensed under the [Do No Harm](http://github.com/raisely/NoHarm) license.

