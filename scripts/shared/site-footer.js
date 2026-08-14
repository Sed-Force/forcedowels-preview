// /scripts/shared/site-footer.js — <site-footer> web component.
//
// Renders the site-wide footer (brand/tagline, quick links, contact
// info, newsletter signup, bottom bar) and fills in the current year.
// Styling lives in footer.css. Light DOM, same reasoning as
// <site-header>: nothing needs shadow-DOM isolation here, and it keeps
// the markup inspectable/stylable via the regular document stylesheet.

class SiteFooter extends HTMLElement {
  connectedCallback() {
    if (this.dataset.rendered) return;
    this.dataset.rendered = 'true';
    this.classList.add('site-footer');
    this.setAttribute('role', 'contentinfo');
    this.innerHTML = this.template();

    const year = this.querySelector('#year');
    if (year) year.textContent = new Date().getFullYear();

    const form = this.querySelector('.footer-form');
    if (form) form.addEventListener('submit', (e) => e.preventDefault());
  }

  template() {
    return `
      <footer id="footer" >
        <div class="container">
          <div id="footer-content">
            <div
              id="company-info"
              class="footer-content-container"
            >
              <section class="footer-sec">
                <a
                  href="/"
                  aria-label="Force Dowels home"
                  id="footer-logo-wrapper"
                >
                  <img
                    src="/images/LOGO_Wordmark+Icon-WhiteAccent@1024.png"
                    alt="Force Dowels logo"
                    id="footer-logo"
                    class="logo-img"
                  />
                </a>

                <p id="company-tagline">
                  Revolutionary cabinetry fasteners that deliver faster assembly, stronger connections, and flawless finishes. Experience the next generation of cabinet construction.
                </p>
              </section>

              <section class="footer-sec">
                <h4>
                  Contact Us
                </h4>

                <ul id="contact-items-wrapper">
                  <li>
                    (480)-581-7145
                  </li>
                  <li>
                    Hours: Mon-Thurs 7:30AM-4:30PM; Friday 7:30AM-11:30AM
                  </li>
                  <li>
                    <a href="mailto:info@forcedowels.com">info@forcedowels.com</a>
                  </li>
                  <li>
                    24/7 Support
                  </li>
                  <li>
                    4455 E Nunneley Rd, Ste 103<br>Gilbert, AZ 85296
                  </li>
                </ul>
              </section>
            </div>

            <div
              id="site-info"
              class="footer-content-container"
            >
              <section id="quick-links-wrapper" class="footer-sec">
                <h4>
                  Quick Links
                </h4>

                <ul id="quick-links">
                  <li>
                    <a href="/">
                      Home
                    </a>
                  </li>
                  
                  <li>
                    <a href="/order.html">
                      Order Now
                    </a>
                  </li>
                  
                  <li>
                    <a href="/videos.html">
                      Product Videos
                    </a>
                  </li>
                  
                  <li>
                    <a href="/distributors">
                      Find a Distributor
                    </a>
                  </li>

                  <li>
                    <a href="/distributor-application">
                      Become a Distributor
                    </a>
                  </li>
                </ul>
              </section>

              <section id="subscription" class="footer-sec">
                <h4>
                  Stay Updated
                </h4>
                
                <p class="footer-note">
                  Get the latest updates on our patent-pending technology and new product releases.
                </p>
                
                <form id="subscription-form">
                  <label class="sr-only" for="subscription-email">
                    Enter your email
                  </label>
                  
                  <input
                    id="subscription-email"
                    type="email"
                    placeholder="Enter your email"
                    required
                  >
                  
                  <button
                    type="submit"
                    class="btn btn--accent"
                  >
                    Subscribe
                  </button>
                </form>
                
                <p id="subscription-disclaimer">
                  We respect your privacy. Unsubscribe at any time.
                </p>
              </section>
            </div>
          </div>

          <div id="footer-separator"></div>

          <div id="legal" class="container">
            <div id="legal-copyright-container">
              <p id="legal-copyright">
                © <span id="year"></span> Force Dowels. All rights reserved.
              </p>
              
              <p id="legal-patent">
                Patent Pending Technology - Revolutionary Cabinetry Fasteners
              </p>
            </div>

            <ul id="legal-links" aria-label="Legal">
              <li class="legal-link">
                <a href="/privacy.html">
                  Privacy Policy
                </a>
              </li>
              
              <li class="legal-link">
                <a href="/terms.html">
                  Terms of Service
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    `;
  }
}

customElements.define('site-footer', SiteFooter);
