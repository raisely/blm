# YouHaveOur.Support ✊🏿✊🏾✊🏽

**Did you come here to report an issue with the site, an update that's needed or a resource that should be added/fixed?**

👉🏾 [Click here to contact us](https://github.com/raisely/blm/issues/new) 👈🏾

---

### About

This app compiles #BLM resources focusing on organisations you can donate to to support #BLM in your country.

The information at [YouHaveOur.Support](https://YouHaveOur.Support) is compiled automatically from 
community created spreadsheets in order to make the information more accessible to those who wish to support.

### How it works

YouHaveOur.Support is hosted on [Raisely.com](https://raisely.com), using [custom react components](components)
supported by two [cloud functions](functions) to compile the information.

The [lookup](functions/lookup) compiles links from community generated spreadsheets into a main spreadsheet. This function is triggered
about once every 30 minutes (but only if people are using the site).
The lookup function will attempt to scrape a logo from the donation link or extract a twitter avatar
on the donation page the link.

The [refresh](functions/refresh) function returns the contents of the main spreadsheet as json for use on the site. The function
uses a nano-cache that expires every 30 minutes to speed response time.

The compiled information is cached into a [main spreadsheet](https://docs.google.com/spreadsheets/d/1BrzORduZ4Zf4y0HlHbkOnZqT826fHCjI_c4k4y0AaMo/edit#gid=854958934) that can be used to correct logos or descriptions
or hide an entry if need be.

Entries will not be displayed on YouHaveOur.Support unless they appear in at least one community spreadsheet. This keeps power in the hands of the community spreadsheet maintainers who can remove bad entries and they will be removed from the site.

### Authors

This site has been built by the team at [Raisely](https://github.com/raisely)

### License

This software is licensed under the [Do No Harm](http://github.com/raisely/NoHarm) license.

