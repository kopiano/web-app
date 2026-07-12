import { NavLink } from 'react-router-dom';
import '@/styles/overview.scss';
import github_img from '@/assets/images/overview/github.svg';
import codepen_img from '@/assets/images/overview/codepen.svg';
import awwwards_img from '@/assets/images/overview/awwwards.webp';

function Overview() {
  return (
    <section className="home" id="home">
      <div className="content">
        <div className="content-name">
          <span>C</span>oulson <span>Z</span>ero
        </div>
        <p>front-end developer</p>
        <NavLink to="http://www.coulsonzero.shop/docs" className="content-btn" target="_blank">
          <span>Get Started</span>
          <div className="arrow">
            <div className="bar"></div>
            <div className="triangle"></div>
          </div>
        </NavLink>
      </div>

      {/* <!-- ===== icons ====== --> */}
      <ul className="social">
          <li className="social-item">
              <NavLink to="https://github.com/kopiano" target="_blank">
                  <img src={github_img} alt="github" />
              </NavLink>
              <div className="box-tooltip" data-name="github">
                  <div className="tooltip-text" data-color="github">Github</div>
              </div>
          </li>
          <li className="social-item">
              <NavLink to="https://codepen.io/coulsonzero" target="_blank" rel="noopener">
                  <img src={codepen_img} alt="codepen" />
              </NavLink>
              <div className="box-tooltip" data-name="codepen">
                  <div className="tooltip-text" data-color="codepen">CodePen</div>
              </div>
          </li>
          <li>
              <div className="icon-line"></div>
          </li>
      </ul>
      {/* <!-- === Awwwards === --> */}
      <div id="awwwards" className="awwwards">
          <a href="http://www.awwwards.com" target="_blank">
              <img src={awwwards_img} alt="awwwards" />
          </a>
      </div>
    </section>
  );
}

export default Overview;
