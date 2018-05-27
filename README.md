# fa.js

A Javascript API for accessing FurAffinity

### Example

```
const FurAffinityClient = require("fa.js").FurAffinityClient;

// These are your FA cookies
const fa = new FurAffinityClient("b=XXX; a=XXX; s=1");

fa.getSubmissions().then((submissions) => {
    console.log("Submissions", submissions);
});
```
